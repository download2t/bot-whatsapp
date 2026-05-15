import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import qrcode from 'qrcode';
import whatsappWebJs from 'whatsapp-web.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Client, LocalAuth } = whatsappWebJs;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSIONS_STATE_FILE = path.join(__dirname, '.sessions.json');

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.BRIDGE_PORT ?? 3001);
const backendWebhookUrl = process.env.BACKEND_WEBHOOK_URL ?? 'http://localhost:5207/api/webhooks/whatsapp';
const backendWebhookToken = process.env.BACKEND_WEBHOOK_TOKEN ?? 'CHANGE_THIS_WEBHOOK_TOKEN';
const backendCompanyCode = process.env.BACKEND_COMPANY_CODE ?? 'EMPRESA-TESTE';

let apiAvailable = false;
let sessionCounter = 1;
let persistSessionsQueue = Promise.resolve();

const sessions = new Map();

async function loadPersistedSessionIds() {
  try {
    const raw = await fs.readFile(SESSIONS_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed?.sessions)) {
      return [];
    }

    const valid = parsed.sessions
      .map((item) => String(item ?? '').trim())
      .filter((item) => item.length > 0);

    return Array.from(new Set(valid));
  } catch {
    return [];
  }
}

async function savePersistedSessionIds() {
  const payload = {
    sessions: Array.from(sessions.keys()).sort(),
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(SESSIONS_STATE_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function queuePersistedSessionIds() {
  persistSessionsQueue = persistSessionsQueue
    .catch(() => undefined)
    .then(() => savePersistedSessionIds());

  return persistSessionsQueue;
}

function updateSessionCounterFromId(sessionId) {
  const match = /^session-(\d+)$/i.exec(sessionId);
  if (!match) {
    return;
  }

  const current = Number(match[1]);
  if (Number.isFinite(current)) {
    sessionCounter = Math.max(sessionCounter, current + 1);
  }
}

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

function normalizeSessionId(id) {
  if (!id || id === 'default') {
    return 'default';
  }

  return String(id).trim();
}

function getAuthSessionDir(sessionId) {
  return path.join(__dirname, '.wwebjs_auth', `session-${sessionId}`);
}

function ensureSession(id) {
  const sessionId = normalizeSessionId(id);
  const existing = sessions.get(sessionId);
  if (existing) {
    return existing;
  }

  updateSessionCounterFromId(sessionId);

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: sessionId,
      dataPath: path.join(__dirname, '.wwebjs_auth'),
    }),
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
          messageTimestampUtc: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
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
  void queuePersistedSessionIds().catch((error) => {
    console.error('Failed to persist session list:', error?.message ?? error);
  });
  return session;
}

async function restartSessionById(id) {
  const sessionId = normalizeSessionId(id);
  const previous = sessions.get(sessionId);
  if (!previous) {
    return null;
  }

  previous.manualDisconnect = true;
  try {
    await previous.client.destroy();
  } catch {
    // Ignore client destroy failures during restart.
  }

  sessions.delete(sessionId);
  const recreated = ensureSession(sessionId);
  await initializeSessionIfNeeded(recreated);
  return recreated;
}

async function logoutDefinitiveById(id) {
  const sessionId = normalizeSessionId(id);
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  session.manualDisconnect = true;
  try {
    await session.client.logout();
  } catch {
    // Some states may fail logout; continue with destroy + cleanup.
  }

  try {
    await session.client.destroy();
  } catch {
    // Ignore destroy failures while forcing definitive logout.
  }

  sessions.delete(sessionId);

  try {
    await fs.rm(getAuthSessionDir(sessionId), { recursive: true, force: true });
  } catch {
    // Best effort cleanup of local auth artifacts.
  }

  try {
    await queuePersistedSessionIds();
    await savePersistedSessionIds();
  } catch {
    // Keep endpoint resilient even if metadata persistence fails.
  }

  return { id: sessionId };
}

async function initializeSessionIfNeeded(session) {
  if (session.clientReady || session.isInitializing) {
    return;
  }

  try {
    session.isInitializing = true;
    session.status = 'connecting';
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

app.post('/session/:id/restart', async (req, res) => {
  const sessionId = normalizeSessionId(req.params.id);

  try {
    const restarted = await restartSessionById(sessionId);
    if (!restarted) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.status(202).json({
      ok: true,
      id: restarted.id,
      action: 'restart',
      preservedAuth: true,
      status: restarted.status,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message ?? 'Unable to restart session' });
  }
});

app.post('/session/restart-all', async (_req, res) => {
  const ids = Array.from(sessions.keys());
  const restarted = [];
  const failed = [];

  for (const id of ids) {
    try {
      const item = await restartSessionById(id);
      if (item) {
        restarted.push(id);
      }
    } catch (error) {
      failed.push({ id, error: error?.message ?? 'Unable to restart session' });
    }
  }

  return res.status(202).json({
    ok: failed.length === 0,
    action: 'restart-all',
    total: ids.length,
    restarted,
    failed,
  });
});

app.post('/session/:id/logout-definitivo', async (req, res) => {
  const sessionId = normalizeSessionId(req.params.id);

  try {
    const removed = await logoutDefinitiveById(sessionId);
    if (!removed) {
      return res.status(404).json({ error: 'Session not found' });
    }

    return res.json({
      ok: true,
      id: removed.id,
      action: 'logout-definitivo',
      removedFromPersistence: true,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message ?? 'Unable to logout definitively' });
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
  console.log(`Session state file: ${SESSIONS_STATE_FILE}`);
});

async function restorePersistedSessions() {
  const restoredIds = await loadPersistedSessionIds();
  if (restoredIds.length === 0) {
    return;
  }

  console.log(`Restoring ${restoredIds.length} persisted session(s)...`);
  for (const id of restoredIds) {
    const session = ensureSession(id);
    // Keep startup resilient: restore all sessions even if one fails.
    await initializeSessionIfNeeded(session).catch((error) => {
      session.lastError = error?.message ?? 'Unable to restore session';
      session.status = 'error';
    });
  }
}

void restorePersistedSessions().catch((error) => {
  console.error('Failed to restore persisted sessions:', error?.message ?? error);
});

process.on('SIGINT', async () => {
  try {
    const tasks = Array.from(sessions.values()).map(session => session.client.destroy().catch(() => undefined));
    await Promise.all(tasks);
  } finally {
    process.exit(0);
  }
});
