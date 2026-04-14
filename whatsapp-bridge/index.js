import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import qrcode from 'qrcode';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import whatsappWebJs from 'whatsapp-web.js';

const { Client, LocalAuth } = whatsappWebJs;

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.BRIDGE_PORT ?? 3001);
const backendWebhookUrl = process.env.BACKEND_WEBHOOK_URL ?? 'http://localhost:5207/api/webhooks/whatsapp';
const backendWebhookToken = process.env.BACKEND_WEBHOOK_TOKEN ?? 'CHANGE_THIS_WEBHOOK_TOKEN';
const backendCompanyCode = process.env.BACKEND_COMPANY_CODE ?? 'EMPRESA-TESTE';
const authRootDir = path.resolve(process.cwd(), '.wwebjs_auth');

let apiAvailable = false;
let sessionCounter = 1;

const sessions = new Map();
const sessionFolderPrefix = 'session-api-bot-whatsapp-';

function normalizePhone(raw) {
  return String(raw ?? '').replace(/\D/g, '');
}

function sessionToStatus(session) {
  return {
    id: session.id,
    status: session.status,
    isConnected: session.clientReady,
    hasQr: Boolean(session.qrDataUrl),
    apiAvailable,
    phoneNumber: session.phoneNumber,
    lastError: session.lastError,
  };
}

function buildSessionId() {
  while (true) {
    const id = `session-${sessionCounter++}`;
    if (!sessions.has(id)) {
      return id;
    }
  }
}

function getPersistedSessionIds() {
  const ids = new Set();

  try {
    if (fs.existsSync(authRootDir)) {
      const entries = fs.readdirSync(authRootDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith(sessionFolderPrefix)) {
          continue;
        }

        const id = entry.name.slice(sessionFolderPrefix.length).trim();
        if (id) {
          ids.add(id);
        }
      }
    }
  } catch {
    // Ignore read errors and fallback to default session.
  }

  if (ids.size === 0) {
    ids.add('default');
  }

  return Array.from(ids);
}

function cleanupStaleBrowserProcesses() {
  if (process.platform !== 'win32') {
    return;
  }

  const script = `
    $target = ${JSON.stringify(authRootDir)}
    Get-CimInstance Win32_Process |
      Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like "*$target*" } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  `;

  spawnSync('powershell', ['-NoProfile', '-Command', script], {
    stdio: 'ignore',
  });
}

async function refreshApiAvailability() {
  try {
    const response = await axios.get(`${new URL(backendWebhookUrl).origin}/health`, {
      timeout: 2500,
      validateStatus: () => true,
    });

    apiAvailable = response.status >= 200 && response.status < 300;
    return apiAvailable;
  } catch {
    apiAvailable = false;
    return false;
  }
}

function getSessionOrDefault(id) {
  if (!id || !sessions.has(id)) {
    return sessions.get('default') ?? null;
  }

  return sessions.get(id) ?? null;
}

function ensureSession(id) {
  const sessionId = id || 'default';
  const existing = sessions.get(sessionId);
  if (existing) {
    return existing;
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: `api-bot-whatsapp-${sessionId}` }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  const session = {
    id: sessionId,
    client,
    status: 'initializing',
    qrDataUrl: null,
    phoneNumber: null,
    lastError: null,
    clientReady: false,
    isInitializing: false,
    manualDisconnect: false,
  };

  client.on('qr', async (qr) => {
    session.qrDataUrl = await qrcode.toDataURL(qr);
    session.status = 'qr-required';
    session.clientReady = false;
  });

  client.on('ready', async () => {
    session.status = 'connected';
    session.clientReady = true;
    session.qrDataUrl = null;
    session.lastError = null;
    session.manualDisconnect = false;
    const info = client.info;
    session.phoneNumber = info?.wid?.user ?? info?.me?.user ?? null;
  });

  client.on('authenticated', () => {
    session.status = 'authenticating';
  });

  client.on('auth_failure', (message) => {
    session.status = 'auth-failure';
    session.lastError = message;
    session.clientReady = false;
  });

  client.on('disconnected', (reason) => {
    session.status = 'disconnected';
    session.lastError = reason;
    session.clientReady = false;
    session.qrDataUrl = null;

    if (!session.manualDisconnect) {
      setTimeout(() => {
        void initializeSessionIfNeeded(session);
      }, 1500);
    }
  });

  client.on('message', async (message) => {
    try {
      if (message.fromMe || !message.from) {
        return;
      }

      const source = String(message.from);
      if (source.endsWith('@g.us') || source === 'status@broadcast') {
        return;
      }

      const contact = await message.getContact();
      const phoneNumber = contact.number || source.replace(/\D/g, '');
      if (!phoneNumber) {
        return;
      }

      const response = await axios.post(
        backendWebhookUrl,
        {
          phoneNumber,
          message: message.body ?? '',
          companyCode: backendCompanyCode,
          whatsAppNumber: session.phoneNumber,
        },
        {
          validateStatus: () => true,
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Token': backendWebhookToken,
          },
        },
      );

      if (response.status >= 400) {
        session.lastError = `Webhook returned ${response.status}`;
        return;
      }

      session.lastError = null;
    } catch (error) {
      session.lastError = error?.message ?? 'Webhook forward failed';
    }
  });

  sessions.set(sessionId, session);
  return session;
}

async function initializeSessionIfNeeded(session) {
  if (session.clientReady || session.isInitializing) {
    return;
  }

  try {
    session.isInitializing = true;
    session.status = 'connecting';
    cleanupStaleBrowserProcesses();
    await session.client.initialize();
  } catch (error) {
    session.lastError = error?.message ?? 'Unable to initialize WhatsApp client';
    session.status = 'error';
  } finally {
    session.isInitializing = false;
  }
}

async function disconnectSession(session, { logout = false } = {}) {
  session.manualDisconnect = true;

  if (logout) {
    try {
      await session.client.logout();
    } catch {
      // Ignore and continue with cleanup state.
    }
  } else {
    try {
      await session.client.destroy();
    } catch {
      // Ignore and continue with cleanup state.
    }
  }

  session.status = 'disconnected';
  session.clientReady = false;
  session.qrDataUrl = null;
  session.phoneNumber = null;
}

function pickSenderSession(sourceWhatsAppNumber) {
  const normalizedSource = normalizePhone(sourceWhatsAppNumber);
  const allSessions = Array.from(sessions.values());

  if (normalizedSource) {
    const matching = allSessions.find(item => item.clientReady && normalizePhone(item.phoneNumber) === normalizedSource);
    if (matching) {
      return matching;
    }
  }

  const defaultConnected = sessions.get('default');
  if (defaultConnected?.clientReady) {
    return defaultConnected;
  }

  return allSessions.find(item => item.clientReady) ?? null;
}

app.get('/health', (_req, res) => {
  const connected = Array.from(sessions.values()).filter(item => item.clientReady).length;
  res.json({ ok: true, connectedSessions: connected });
});

app.get('/session/list', (_req, res) => {
  void refreshApiAvailability();
  const payload = Array.from(sessions.values()).map(sessionToStatus);
  res.json(payload);
});

app.get('/session/status', (_req, res) => {
  void refreshApiAvailability();
  const selected = Array.from(sessions.values()).find(item => item.clientReady)
    ?? sessions.get('default')
    ?? null;

  if (!selected) {
    return res.json({
      status: 'not-initialized',
      isConnected: false,
      hasQr: false,
      apiAvailable,
      phoneNumber: null,
      lastError: null,
    });
  }

  return res.json({
    status: selected.status,
    isConnected: selected.clientReady,
    hasQr: Boolean(selected.qrDataUrl),
    apiAvailable,
    phoneNumber: selected.phoneNumber,
    lastError: selected.lastError,
  });
});

app.post('/session/create', async (_req, res) => {
  const id = buildSessionId();
  ensureSession(id);
  return res.status(201).json({ id, status: 'created' });
});

app.get('/session/:id/qr', (req, res) => {
  const session = getSessionOrDefault(req.params.id);
  if (!session || !session.qrDataUrl) {
    return res.status(404).json({ qrDataUrl: null });
  }

  return res.json({ qrDataUrl: session.qrDataUrl });
});

app.post('/session/:id/connect', async (req, res) => {
  try {
    const id = req.params.id === 'default' ? 'default' : req.params.id;
    const session = ensureSession(id);
    await initializeSessionIfNeeded(session);
    return res.status(202).json({ status: session.status, id: session.id });
  } catch (error) {
    return res.status(500).json({ error: error?.message ?? 'Unable to connect' });
  }
});

app.post('/session/:id/disconnect', async (req, res) => {
  const session = getSessionOrDefault(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    await disconnectSession(session, { logout: false });
    return res.status(202).json({ status: session.status, id: session.id });
  } catch (error) {
    session.lastError = error?.message ?? 'Unable to disconnect';
    return res.status(500).json({ error: session.lastError });
  }
});

app.post('/session/:id/pairing-code', async (req, res) => {
  const session = getSessionOrDefault(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    const phoneNumber = normalizePhone(req.body?.phoneNumber);
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required' });
    }

    await initializeSessionIfNeeded(session);
    if (typeof session.client.requestPairingCode !== 'function') {
      return res.status(501).json({ error: 'Pairing code is not supported by this bridge version' });
    }

    const pairingCode = await session.client.requestPairingCode(phoneNumber);
    return res.json({ pairingCode });
  } catch (error) {
    session.lastError = error?.message ?? 'Unable to generate pairing code';
    return res.status(500).json({ error: session.lastError });
  }
});

// Legacy endpoints kept for compatibility with older API client versions.
app.get('/session/qr', (_req, res) => {
  const session = getSessionOrDefault('default');
  if (!session || !session.qrDataUrl) {
    return res.status(404).json({ qrDataUrl: null });
  }

  return res.json({ qrDataUrl: session.qrDataUrl });
});

app.post('/session/connect', async (_req, res) => {
  const session = ensureSession('default');
  await initializeSessionIfNeeded(session);
  return res.status(202).json({ status: session.status, id: session.id });
});

app.post('/session/disconnect', async (_req, res) => {
  const session = getSessionOrDefault('default');
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  await disconnectSession(session, { logout: false });
  return res.status(202).json({ status: session.status, id: session.id });
});

app.post('/session/pairing-code', async (req, res) => {
  const session = getSessionOrDefault('default');
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const phoneNumber = normalizePhone(req.body?.phoneNumber);
  if (!phoneNumber) {
    return res.status(400).json({ error: 'phoneNumber is required' });
  }

  await initializeSessionIfNeeded(session);
  if (typeof session.client.requestPairingCode !== 'function') {
    return res.status(501).json({ error: 'Pairing code is not supported by this bridge version' });
  }

  const pairingCode = await session.client.requestPairingCode(phoneNumber);
  return res.json({ pairingCode });
});

app.post('/messages/send', async (req, res) => {
  try {
    const { phoneNumber, message, markAsUnread, sourceWhatsAppNumber } = req.body ?? {};
    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'phoneNumber and message are required' });
    }

    const senderSession = pickSenderSession(sourceWhatsAppNumber);
    if (!senderSession) {
      return res.status(409).json({ error: 'No connected WhatsApp session available' });
    }

    const normalizedPhone = normalizePhone(phoneNumber);
    const target = `${normalizedPhone}@c.us`;
    const result = await senderSession.client.sendMessage(target, String(message));

    let unreadApplied = false;
    if (Boolean(markAsUnread)) {
      try {
        const chat = await senderSession.client.getChatById(target);
        if (chat && typeof chat.markUnread === 'function') {
          await chat.markUnread();
          unreadApplied = true;
        }
      } catch {
        unreadApplied = false;
      }
    }

    return res.json({
      success: true,
      sessionId: senderSession.id,
      sourceWhatsAppNumber: senderSession.phoneNumber,
      messageId: result.id?._serialized ?? null,
      unreadApplied,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message ?? 'Send failed' });
  }
});

app.listen(port, () => {
  console.log(`WhatsApp bridge running on http://localhost:${port}`);
  console.log(`Backend webhook target: ${backendWebhookUrl}`);
  void refreshApiAvailability();

  const restoredIds = getPersistedSessionIds();
  console.log(`Restoring ${restoredIds.length} persisted session(s): ${restoredIds.join(', ')}`);
  for (const id of restoredIds) {
    const session = ensureSession(id);
    void initializeSessionIfNeeded(session);
  }
});

process.on('SIGINT', async () => {
  try {
    const tasks = Array.from(sessions.values()).map(session => session.client.destroy().catch(() => undefined));
    await Promise.all(tasks);
  } finally {
    process.exit(0);
  }
});
