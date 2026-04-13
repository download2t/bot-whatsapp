import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import qrcode from 'qrcode';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import whatsappWebJs from 'whatsapp-web.js';

const { Client, LocalAuth } = whatsappWebJs;

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.BRIDGE_PORT ?? 3001);
const backendWebhookUrl = process.env.BACKEND_WEBHOOK_URL ?? 'http://localhost:5207/api/webhooks/whatsapp';
const backendWebhookToken = process.env.BACKEND_WEBHOOK_TOKEN ?? 'CHANGE_THIS_WEBHOOK_TOKEN';
const sessionUserDataDir = path.resolve(process.cwd(), '.wwebjs_auth', 'session-api-bot-whatsapp');

let status = 'initializing';
let currentQrDataUrl = null;
let currentPhoneNumber = null;
let lastError = null;
let clientReady = false;
let isInitializingClient = false;
let apiAvailable = false;

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

function cleanupStaleBrowserProcesses() {
  if (process.platform !== 'win32') {
    return;
  }

  const script = `
    $target = ${JSON.stringify(sessionUserDataDir)}
    Get-CimInstance Win32_Process |
      Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like "*$target*" } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  `;

  spawnSync('powershell', ['-NoProfile', '-Command', script], {
    stdio: 'ignore',
  });
}

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'api-bot-whatsapp' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', async (qr) => {
  currentQrDataUrl = await qrcode.toDataURL(qr);
  status = 'qr-required';
  clientReady = false;
});

client.on('ready', async () => {
  status = 'connected';
  clientReady = true;
  currentQrDataUrl = null;
  lastError = null;
  const info = client.info;
  currentPhoneNumber = info?.wid?.user ?? info?.me?.user ?? null;
});

client.on('authenticated', () => {
  status = 'authenticating';
});

client.on('auth_failure', (message) => {
  status = 'auth-failure';
  lastError = message;
  clientReady = false;
});

client.on('disconnected', (reason) => {
  status = 'disconnected';
  lastError = reason;
  clientReady = false;
});

async function initializeClientIfNeeded() {
  if (clientReady || isInitializingClient) {
    return;
  }

  try {
    isInitializingClient = true;
    status = 'connecting';
    cleanupStaleBrowserProcesses();
    await client.initialize();
  } catch (error) {
    lastError = error?.message ?? 'Unable to initialize WhatsApp client';
    status = 'error';
  } finally {
    isInitializingClient = false;
  }
}

client.on('message', async (message) => {
  try {
    if (message.fromMe) {
      return;
    }

    if (!message.from) {
      return;
    }

    const source = String(message.from);

    // Ignore groups and broadcast/status traffic.
    if (source.endsWith('@g.us') || source === 'status@broadcast') {
      return;
    }

    // Get contact information to extract the actual phone number
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
      lastError = `Webhook returned ${response.status}`;
      return;
    }

    lastError = null;
  } catch (error) {
    lastError = error?.message ?? 'Webhook forward failed';
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, status, clientReady });
});

app.get('/session/status', (_req, res) => {
  void refreshApiAvailability();

  res.json({
    status,
    isConnected: clientReady,
    hasQr: Boolean(currentQrDataUrl),
    apiAvailable,
    phoneNumber: currentPhoneNumber,
    lastError,
  });
});

app.get('/session/qr', (_req, res) => {
  if (!currentQrDataUrl) {
    return res.status(404).json({ qrDataUrl: null });
  }

  return res.json({ qrDataUrl: currentQrDataUrl });
});

app.post('/session/connect', async (_req, res) => {
  try {
    await initializeClientIfNeeded();
    return res.status(202).json({ status: 'connecting' });
  } catch (error) {
    lastError = error?.message ?? 'Unable to connect';
    return res.status(500).json({ error: lastError });
  }
});

app.post('/session/disconnect', async (_req, res) => {
  try {
    await client.logout();
    status = 'disconnected';
    clientReady = false;
    currentQrDataUrl = null;
    currentPhoneNumber = null;
    setTimeout(() => {
      void initializeClientIfNeeded();
    }, 500);
    return res.status(202).json({ status: 'disconnected' });
  } catch (error) {
    lastError = error?.message ?? 'Unable to disconnect';
    return res.status(500).json({ error: lastError });
  }
});

app.post('/session/pairing-code', async (req, res) => {
  try {
    const phoneNumber = String(req.body?.phoneNumber ?? '').replace(/\D/g, '');
    if (!phoneNumber) {
      return res.status(400).json({ error: 'phoneNumber is required' });
    }

    await initializeClientIfNeeded();
    if (typeof client.requestPairingCode !== 'function') {
      return res.status(501).json({ error: 'Pairing code is not supported by this bridge version' });
    }

    const pairingCode = await client.requestPairingCode(phoneNumber);
    return res.json({ pairingCode });
  } catch (error) {
    lastError = error?.message ?? 'Unable to generate pairing code';
    return res.status(500).json({ error: lastError });
  }
});

app.post('/messages/send', async (req, res) => {
  try {
    const { phoneNumber, message, markAsUnread } = req.body ?? {};
    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'phoneNumber and message are required' });
    }

    if (!clientReady) {
      return res.status(409).json({ error: 'WhatsApp session is not connected' });
    }

    const normalizedPhone = String(phoneNumber).replace(/\D/g, '');
    const target = `${normalizedPhone}@c.us`;
    const result = await client.sendMessage(target, String(message));

    let unreadApplied = false;
    if (Boolean(markAsUnread)) {
      try {
        const chat = await client.getChatById(target);
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
      messageId: result.id?._serialized ?? null,
      unreadApplied,
    });
  } catch (error) {
    lastError = error?.message ?? 'Send failed';
    return res.status(500).json({ error: lastError });
  }
});

app.listen(port, () => {
  console.log(`WhatsApp bridge running on http://localhost:${port}`);
  console.log(`Backend webhook target: ${backendWebhookUrl}`);
  void refreshApiAvailability();
  void initializeClientIfNeeded();
});

process.on('SIGINT', async () => {
  try {
    await client.destroy();
  } finally {
    process.exit(0);
  }
});
