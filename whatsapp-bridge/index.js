import "dotenv/config";
import express from "express";
import cors from "cors";
import axios from "axios";
import qrcode from "qrcode";
import whatsappWebJs from "whatsapp-web.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Client, LocalAuth, MessageMedia } = whatsappWebJs;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSIONS_STATE_FILE = path.join(__dirname, ".sessions.json");

const app = express();
app.use(cors());
app.use(express.json({ limit: "40mb" }));

const port = Number(process.env.BRIDGE_PORT ?? 3001);
const backendWebhookUrl =
  process.env.BACKEND_WEBHOOK_URL ??
  "http://localhost:5207/api/webhooks/whatsapp";
const backendWebhookToken =
  process.env.BACKEND_WEBHOOK_TOKEN ?? "CHANGE_THIS_WEBHOOK_TOKEN";
const backendAckWebhookUrl = `${backendWebhookUrl}/ack`;
const MAX_INCOMING_MEDIA_BYTES = 20 * 1024 * 1024;

// whatsapp-web.js's numeric ack codes (Message.ack / the message_ack event's second argument).
const ACK_STATUS_BY_CODE = {
  "-1": "error",
  0: "pending",
  1: "sent",
  2: "delivered",
  3: "read",
  4: "played",
};

let apiAvailable = false;
let sessionCounter = 1;
let persistSessionsQueue = Promise.resolve();

const sessions = new Map();

async function loadPersistedSessionIds() {
  try {
    const raw = await fs.readFile(SESSIONS_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed?.sessions)) {
      return [];
    }

    const valid = parsed.sessions
      .map((item) => String(item ?? "").trim())
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

  await fs.writeFile(
    SESSIONS_STATE_FILE,
    JSON.stringify(payload, null, 2),
    "utf8",
  );
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
  return String(raw ?? "").replace(/\D/g, "");
}

// WhatsApp's LID (Linked ID) privacy system hides the real phone number behind an opaque
// id (e.g. "186762425069751@lid") for contacts that haven't shared their number with this
// account yet — contact.number comes back empty for those. Resolve the real phone number
// explicitly via the client's LID<->phone lookup instead of falling back to the LID digits
// (which would never match anything in Contatos and silently break auto-reply).
async function resolveMessagePhoneNumber(client, rawPhone, contact) {
  if (!rawPhone.endsWith("@lid")) {
    return contact.number || rawPhone.replace(/\D/g, "");
  }

  console.log(
    `[LID] Resolvendo ${rawPhone} — contact.number=${contact.number ?? "(vazio)"} contact.id=${JSON.stringify(contact.id)}`,
  );

  try {
    const [resolved] = await client.getContactLidAndPhone([rawPhone]);
    console.log(`[LID] Resultado de getContactLidAndPhone: ${JSON.stringify(resolved)}`);
    if (resolved?.pn) {
      return String(resolved.pn).replace(/\D/g, "");
    }
  } catch (error) {
    console.log(`[LID] getContactLidAndPhone falhou: ${error?.message ?? error}`);
  }

  console.log(`[LID] Não foi possível resolver o número real de ${rawPhone} — usando fallback (pode ficar incorreto).`);
  return contact.number || rawPhone.replace(/\D/g, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestPairingCodeWithRetry(session, phoneNumber, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await session.client.requestPairingCode(phoneNumber);
    } catch (error) {
      lastError = error;
      await delay(1500 * attempt);
    }
  }
  throw lastError;
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
    const response = await axios.get(
      `${new URL(backendWebhookUrl).origin}/health`,
      {
        timeout: 2500,
        validateStatus: () => true,
      },
    );

    apiAvailable = response.status >= 200 && response.status < 300;
    return apiAvailable;
  } catch {
    apiAvailable = false;
    return false;
  }
}

function getSessionOrDefault(id) {
  if (!id || !sessions.has(id)) {
    return sessions.get("default") ?? null;
  }

  return sessions.get(id) ?? null;
}

function normalizeSessionId(id) {
  if (!id || id === "default") {
    return "default";
  }

  return String(id).trim();
}

function getAuthSessionDir(sessionId) {
  return path.join(__dirname, ".wwebjs_auth", `session-${sessionId}`);
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
      dataPath: path.join(__dirname, ".wwebjs_auth"),
    }),
    // Pins the WhatsApp Web app bundle to whatever version worked on the first successful
    // connect, and reuses it from disk on every restart. Without this, every process restart
    // (e.g. on deploy) can fetch a different live WA Web version, which sometimes makes
    // WhatsApp treat an already-linked session as needing to be re-verified with a new QR.
    webVersionCache: {
      type: "local",
      path: path.join(__dirname, ".wwebjs_cache"),
    },
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=CalculateNativeWinOcclusion",
      ],
    },
  });

  const session = {
    id: sessionId,
    client,
    status: "initializing",
    qrDataUrl: null,
    phoneNumber: null,
    lastError: null,
    clientReady: false,
    isInitializing: false,
    // True once client.initialize() has been successfully started and the underlying
    // Puppeteer browser/page is alive (from first initialize() call until destroy()/disconnect).
    // Prevents a second initialize() call from stepping on an in-flight QR/pairing-code flow
    // (e.g. /connect followed shortly by /pairing-code for the same session).
    clientAlive: false,
    manualDisconnect: false,
    processedMessages: new Set(),
  };

  client.on("qr", async (qr) => {
    session.qrDataUrl = await qrcode.toDataURL(qr);
    session.status = "qr-required";
    session.clientReady = false;
  });

  client.on("ready", async () => {
    session.status = "connected";
    session.clientReady = true;
    session.qrDataUrl = null;
    session.lastError = null;
    session.manualDisconnect = false;
    const info = client.info;
    session.phoneNumber = info?.wid?.user ?? info?.me?.user ?? null;

    console.log(
      `[STATUS] ✅ Sessão ${sessionId} PRONTA! O bot agora está ouvindo mensagens novas.`,
    );
  });

  client.on("authenticated", () => {
    session.status = "authenticating";
    console.log(
      `[STATUS] Sessão ${sessionId} autenticada. Sincronizando histórico... aguarde.`,
    );
  });

  client.on("auth_failure", (message) => {
    session.status = "auth-failure";
    session.lastError = message;
    session.clientReady = false;
  });

  client.on("disconnected", (reason) => {
    session.status = "disconnected";
    session.lastError = reason;
    session.clientReady = false;
    session.qrDataUrl = null;
    session.clientAlive = false;

    if (!session.manualDisconnect) {
      setTimeout(() => {
        void initializeSessionIfNeeded(session);
      }, 1500);
    }
  });

  // EVENTO UNIFICADO message_create
  client.on("message_create", async (message) => {
    let rawPhone = "(unknown)";
    try {
      if (message.fromMe && message.id?.fromMe === false) return;

      const isOutgoing = message.fromMe;
      rawPhone = isOutgoing ? String(message.to) : String(message.from);

      // whatsapp-web.js normally gives every message a stable message.id._serialized, but for
      // some LID-addressed chats it comes back undefined — in that case Set.has(undefined)
      // would treat every such message as "the same message", breaking both this session's own
      // dedup and the API's MessageId-based idempotency guard. Fall back to a content+timestamp
      // key so dedup still works meaningfully instead of silently collapsing everything.
      const messageKey =
        message.id?._serialized ?? `fallback:${rawPhone}:${message.timestamp}:${message.body ?? ""}`;

      console.log(
        `[MSG] Sessão ${sessionId}: message_create de ${rawPhone} (outgoing=${isOutgoing}, type=${message.type}, id=${message.id?._serialized ?? "(sem _serialized, usando fallback)"}, key=${messageKey})`,
      );

      if (rawPhone.endsWith("@g.us") || rawPhone === "status@broadcast") return;

      if (session.processedMessages.has(messageKey)) return;
      session.processedMessages.add(messageKey);
      setTimeout(
        () => session.processedMessages.delete(messageKey),
        60000,
      );

      const contact = await client.getContactById(rawPhone);
      const phoneNumber = await resolveMessagePhoneNumber(client, rawPhone, contact);
      if (!phoneNumber) {
        console.log(`[MSG] Sessão ${sessionId}: descartada — não foi possível determinar um número/id para ${rawPhone}.`);
        return;
      }

      const contactName = contact.name || contact.pushname || null;
      const directionStr = isOutgoing ? "Outgoing" : "Incoming";

      // Download the actual image/video/document so it can be shown again in the chat
      // history later, instead of just logging the text caption. Skipped for outgoing
      // messages (we already have those bytes on the API side, from the send request).
      let mediaBase64 = null;
      let mediaMimeType = null;
      let mediaFileName = null;
      if (!isOutgoing && message.hasMedia) {
        try {
          const media = await message.downloadMedia();
          if (media?.data) {
            const approxBytes = Math.floor((media.data.length * 3) / 4);
            if (approxBytes <= MAX_INCOMING_MEDIA_BYTES) {
              mediaBase64 = media.data;
              mediaMimeType = media.mimetype || null;
              mediaFileName = media.filename || null;
            } else {
              console.log(`[MSG] Sessão ${sessionId}: mídia recebida de ${rawPhone} excede o limite (${approxBytes} bytes), registrando só o texto.`);
            }
          }
        } catch (error) {
          console.log(`[MSG] Sessão ${sessionId}: falha ao baixar mídia recebida de ${rawPhone}: ${error?.message ?? error}`);
        }
      }

      const payload = {
        PhoneNumber: phoneNumber,
        ContactName: contactName,
        Message: message.body ?? "",
        WhatsAppNumber: session.phoneNumber,
        MessageTimestampUtc: message.timestamp
          ? new Date(Number(message.timestamp) * 1000).toISOString()
          : new Date().toISOString(),
        Direction: directionStr,
        MessageId: messageKey,
        OwnerUserId: extractOwnerUserId(session.id),
        RawSenderId: rawPhone,
        MediaBase64: mediaBase64,
        MediaMimeType: mediaMimeType,
        MediaFileName: mediaFileName,
      };

      console.log(
        `[WEBHOOK] Sessão ${sessionId}: enviando para ${backendWebhookUrl} — PhoneNumber=${phoneNumber} OwnerUserId=${payload.OwnerUserId} RawSenderId=${rawPhone}`,
      );

      let response;
      try {
        response = await axios.post(backendWebhookUrl, payload, {
          validateStatus: () => true,
          timeout: 10000,
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Token": backendWebhookToken,
          },
        });
      } catch (httpError) {
        session.lastError = `Webhook unreachable: ${httpError?.message ?? httpError}`;
        console.log(
          `[WEBHOOK] Sessão ${sessionId}: FALHA ao chamar ${backendWebhookUrl} — ${httpError?.message ?? httpError}. A API está rodando? BACKEND_WEBHOOK_URL está certo no .env do bridge?`,
        );
        return;
      }

      if (response.status >= 400) {
        session.lastError = `Webhook returned ${response.status}`;
        console.log(
          `[WEBHOOK] Sessão ${sessionId}: API respondeu ${response.status} — ${JSON.stringify(response.data)}`,
        );
      } else {
        session.lastError = null;
        console.log(
          `[WEBHOOK] Sessão ${sessionId}: API respondeu ${response.status} — ${JSON.stringify(response.data)}`,
        );
      }
    } catch (error) {
      session.lastError = error?.message ?? "Webhook forward failed";
      console.log(
        `[ERRO INTERNO] Sessão ${sessionId}, rawPhone=${rawPhone}: ${error?.stack ?? error?.message ?? error}`,
      );
    }
  });

  // WhatsApp reports delivery-status changes (sent -> delivered -> read) for our own outgoing
  // messages through this event. Forward it so the chat UI can show checkmarks like real
  // WhatsApp Web instead of just "Sent" forever.
  client.on("message_ack", async (message, ack) => {
    try {
      if (!message.fromMe) return;

      const ackStatus = ACK_STATUS_BY_CODE[String(ack)];
      if (!ackStatus) return;

      const messageId = message.id?._serialized;
      const ownerUserId = extractOwnerUserId(session.id);
      if (!messageId || ownerUserId === null) return;

      console.log(`[ACK] Sessão ${sessionId}: ${messageId} -> ${ackStatus} (code=${ack})`);

      await axios.post(
        backendAckWebhookUrl,
        { MessageId: messageId, OwnerUserId: ownerUserId, AckStatus: ackStatus },
        {
          validateStatus: () => true,
          timeout: 10000,
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Token": backendWebhookToken,
          },
        },
      );
    } catch (error) {
      console.log(`[ACK] Sessão ${sessionId}: falha ao repassar ack — ${error?.message ?? error}`);
    }
  });

  sessions.set(sessionId, session);
  void queuePersistedSessionIds().catch((error) => {
    console.error("Failed to persist session list:", error?.message ?? error);
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
  } catch {}

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
  } catch {}

  try {
    await session.client.destroy();
  } catch {}

  sessions.delete(sessionId);

  try {
    await fs.rm(getAuthSessionDir(sessionId), { recursive: true, force: true });
  } catch {}

  try {
    await queuePersistedSessionIds();
    await savePersistedSessionIds();
  } catch {}

  return { id: sessionId };
}

async function initializeSessionIfNeeded(session) {
  if (session.clientReady || session.isInitializing || session.clientAlive) {
    return;
  }

  try {
    session.isInitializing = true;
    session.status = "connecting";
    await session.client.initialize();
    session.clientAlive = true;
  } catch (error) {
    session.lastError =
      error?.message ?? "Unable to initialize WhatsApp client";
    session.status = "error";
  } finally {
    session.isInitializing = false;
  }
}

async function disconnectSession(session, { logout = false } = {}) {
  session.manualDisconnect = true;

  if (logout) {
    try {
      await session.client.logout();
    } catch {}
  } else {
    try {
      await session.client.destroy();
    } catch {}
  }

  session.status = "disconnected";
  session.clientReady = false;
  session.qrDataUrl = null;
  session.phoneNumber = null;
  session.clientAlive = false;
}

// Every session belongs to exactly one app user (id "user-{userId}"). No fallback to "any
// connected session" - that would let one user's message go out through another user's
// WhatsApp number, which is exactly the isolation this is supposed to guarantee.
function pickSenderSession(sessionId) {
  if (!sessionId) {
    return null;
  }

  const session = sessions.get(normalizeSessionId(sessionId));
  return session && session.clientReady ? session : null;
}

// Extracts the owning app user id from a "user-{id}" session id. Returns null for anything
// that doesn't follow that scheme (e.g. legacy sessions), so the API knows not to guess.
function extractOwnerUserId(sessionId) {
  const match = /^user-(\d+)$/.exec(String(sessionId ?? ""));
  return match ? Number(match[1]) : null;
}

app.get("/health", (_req, res) => {
  const connected = Array.from(sessions.values()).filter(
    (item) => item.clientReady,
  ).length;
  res.json({ ok: true, connectedSessions: connected });
});

app.get("/session/list", (_req, res) => {
  void refreshApiAvailability();
  const payload = Array.from(sessions.values()).map(sessionToStatus);
  res.json(payload);
});

app.get("/session/status", (_req, res) => {
  void refreshApiAvailability();
  const selected =
    Array.from(sessions.values()).find((item) => item.clientReady) ??
    sessions.get("default") ??
    null;

  if (!selected) {
    return res.json({
      status: "not-initialized",
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

app.post("/session/create", async (_req, res) => {
  const id = buildSessionId();
  ensureSession(id);
  return res.status(201).json({ id, status: "created" });
});

app.get("/session/:id/qr", (req, res) => {
  const session = getSessionOrDefault(req.params.id);
  if (!session || !session.qrDataUrl) {
    return res.status(404).json({ qrDataUrl: null });
  }

  return res.json({ qrDataUrl: session.qrDataUrl });
});

app.post("/session/:id/connect", async (req, res) => {
  try {
    const id = req.params.id === "default" ? "default" : req.params.id;
    const session = ensureSession(id);
    await initializeSessionIfNeeded(session);
    return res.status(202).json({ status: session.status, id: session.id });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error?.message ?? "Unable to connect" });
  }
});

app.post("/session/:id/disconnect", async (req, res) => {
  const session = getSessionOrDefault(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  try {
    await disconnectSession(session, { logout: false });
    return res.status(202).json({ status: session.status, id: session.id });
  } catch (error) {
    session.lastError = error?.message ?? "Unable to disconnect";
    return res.status(500).json({ error: session.lastError });
  }
});

app.post("/session/:id/restart", async (req, res) => {
  const sessionId = normalizeSessionId(req.params.id);

  try {
    const restarted = await restartSessionById(sessionId);
    if (!restarted) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.status(202).json({
      ok: true,
      id: restarted.id,
      action: "restart",
      preservedAuth: true,
      status: restarted.status,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error?.message ?? "Unable to restart session" });
  }
});

app.post("/session/restart-all", async (_req, res) => {
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
      failed.push({ id, error: error?.message ?? "Unable to restart session" });
    }
  }

  return res.status(202).json({
    ok: failed.length === 0,
    action: "restart-all",
    total: ids.length,
    restarted,
    failed,
  });
});

// Reverse lookup: for each given phone number, ask WhatsApp what id (WID) it currently uses
// for that contact. Used by the API to match an incoming LID-addressed sender against the
// registered Contatos, since decoding a LID back into a phone number directly is unreliable
// and privacy-restricted, but "what id does WhatsApp use for phone X" is not.
app.post("/session/:id/resolve-wid", async (req, res) => {
  const session = getSessionOrDefault(req.params.id);
  if (!session || !session.clientReady) {
    return res.status(409).json({ error: "Session not connected" });
  }

  const phoneNumbers = Array.isArray(req.body?.phoneNumbers)
    ? req.body.phoneNumbers
    : [];

  const results = [];
  for (const phoneNumber of phoneNumbers) {
    const normalized = normalizePhone(phoneNumber);
    if (!normalized) continue;

    try {
      const wid = await session.client.getNumberId(normalized);
      results.push({ phoneNumber, wid: wid?._serialized ?? null });
    } catch (error) {
      results.push({ phoneNumber, wid: null, error: error?.message ?? String(error) });
    }
  }

  return res.json(results);
});

app.post("/session/:id/logout-definitivo", async (req, res) => {
  const sessionId = normalizeSessionId(req.params.id);

  try {
    const removed = await logoutDefinitiveById(sessionId);
    if (!removed) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.json({
      ok: true,
      id: removed.id,
      action: "logout-definitivo",
      removedFromPersistence: true,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: error?.message ?? "Unable to logout definitively" });
  }
});

app.post("/session/:id/pairing-code", async (req, res) => {
  const session = getSessionOrDefault(req.params.id);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  try {
    const phoneNumber = normalizePhone(req.body?.phoneNumber);
    if (!phoneNumber) {
      return res.status(400).json({ error: "phoneNumber is required" });
    }

    await initializeSessionIfNeeded(session);
    if (typeof session.client.requestPairingCode !== "function") {
      return res
        .status(501)
        .json({
          error: "Pairing code is not supported by this bridge version",
        });
    }

    // Right after initialize() resolves, WhatsApp Web's own linking page can still be a
    // moment away from finishing wiring up its internal callbacks. Calling
    // requestPairingCode too early throws "window.onCodeReceivedEvent is not a function".
    // Give it a beat, then retry with backoff instead of failing on the first race.
    await delay(1200);
    const pairingCode = await requestPairingCodeWithRetry(session, phoneNumber);
    return res.json({ pairingCode });
  } catch (error) {
    session.lastError = error?.message ?? "Unable to generate pairing code";
    return res.status(500).json({ error: session.lastError });
  }
});

app.get("/session/qr", (_req, res) => {
  const session = getSessionOrDefault("default");
  if (!session || !session.qrDataUrl) {
    return res.status(404).json({ qrDataUrl: null });
  }

  return res.json({ qrDataUrl: session.qrDataUrl });
});

app.post("/session/connect", async (_req, res) => {
  const session = ensureSession("default");
  await initializeSessionIfNeeded(session);
  return res.status(202).json({ status: session.status, id: session.id });
});

app.post("/session/disconnect", async (_req, res) => {
  const session = getSessionOrDefault("default");
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  await disconnectSession(session, { logout: false });
  return res.status(202).json({ status: session.status, id: session.id });
});

app.post("/session/pairing-code", async (req, res) => {
  const session = getSessionOrDefault("default");
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  const phoneNumber = normalizePhone(req.body?.phoneNumber);
  if (!phoneNumber) {
    return res.status(400).json({ error: "phoneNumber is required" });
  }

  await initializeSessionIfNeeded(session);
  if (typeof session.client.requestPairingCode !== "function") {
    return res
      .status(501)
      .json({ error: "Pairing code is not supported by this bridge version" });
  }

  const pairingCode = await session.client.requestPairingCode(phoneNumber);
  return res.json({ pairingCode });
});

app.post("/messages/send", async (req, res) => {
  try {
    const {
      phoneNumber,
      message,
      markAsUnread,
      sessionId,
      mediaBase64,
      mediaMimeType,
      mediaFileName,
    } = req.body ?? {};
    if (!phoneNumber || (!message && !mediaBase64)) {
      return res
        .status(400)
        .json({ error: "phoneNumber and (message or mediaBase64) are required" });
    }

    const senderSession = pickSenderSession(sessionId);
    if (!senderSession) {
      return res
        .status(409)
        .json({ error: "Your WhatsApp session is not connected" });
    }

    const normalizedPhone = normalizePhone(phoneNumber);
    let target = `${normalizedPhone}@c.us`;

    // WhatsApp now tracks many contacts internally via LID instead of phone-based JID even
    // for outgoing sends. Sending straight to "{phone}@c.us" for one of those contacts fails
    // deep inside WhatsApp Web's own code ("No LID for user"). getNumberId() alone isn't
    // reliable here either (throws "Cannot read properties of undefined (reading 'id')" for
    // some LID contacts) — getContactById() is the same call that already correctly resolves
    // LID contacts on the receive side (see resolveMessagePhoneNumber's [LID] logs, where
    // contact.id came back as the proper "...@c.us"/"...@lid" id), so reuse it here too.
    try {
      const contact = await senderSession.client.getContactById(target);
      if (contact?.id?._serialized) {
        target = contact.id._serialized;
      } else {
        console.log(`[SEND] Sessão ${sessionId}: getContactById não retornou id resolvido para ${normalizedPhone}, usando fallback ${target}.`);
      }
    } catch (error) {
      console.log(`[SEND] Sessão ${sessionId}: falha ao resolver contato de ${normalizedPhone} (${error?.message ?? error}), usando fallback ${target}.`);
    }

    console.log(`[SEND] Sessão ${sessionId}: enviando para target=${target} (phoneNumber=${normalizedPhone}).`);

    let result;
    if (mediaBase64) {
      const media = new MessageMedia(
        mediaMimeType || "application/octet-stream",
        mediaBase64,
        mediaFileName || "arquivo",
      );
      result = await senderSession.client.sendMessage(
        target,
        media,
        message ? { caption: String(message) } : undefined,
      );
    } else {
      result = await senderSession.client.sendMessage(target, String(message));
    }

    // 👇 SOLUÇÃO DA DUPLICAÇÃO DE MENSAGENS ENVIADAS PELO SISTEMA
    // Injeta o ID da mensagem no cache para que o evento 'message_create' ignore ela
    if (result && result.id) {
      senderSession.processedMessages =
        senderSession.processedMessages || new Set();
      senderSession.processedMessages.add(result.id._serialized);
      setTimeout(
        () => senderSession.processedMessages.delete(result.id._serialized),
        60000,
      );
    }

    let unreadApplied = false;
    if (Boolean(markAsUnread)) {
      try {
        const chat = await senderSession.client.getChatById(target);
        if (chat && typeof chat.markUnread === "function") {
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
      messageId: result?.id?._serialized ?? null,
      unreadApplied,
    });
  } catch (error) {
    console.log(`[SEND] Falha ao enviar mensagem: ${error?.stack ?? error?.message ?? error}`);
    return res.status(500).json({ error: error?.message ?? "Send failed" });
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
    const authDirExists = await fs
      .access(getAuthSessionDir(normalizeSessionId(id)))
      .then(() => true)
      .catch(() => false);
    console.log(
      `[RESTORE] Sessão ${id}: auth local ${authDirExists ? "encontrada" : "NÃO encontrada"} em ${getAuthSessionDir(normalizeSessionId(id))}${authDirExists ? "" : " — provavelmente vai pedir novo QR."}`,
    );

    const session = ensureSession(id);
    await initializeSessionIfNeeded(session).catch((error) => {
      session.lastError = error?.message ?? "Unable to restore session";
      session.status = "error";
    });
  }
}

void restorePersistedSessions().catch((error) => {
  console.error(
    "Failed to restore persisted sessions:",
    error?.message ?? error,
  );
});

process.on("SIGINT", async () => {
  try {
    const tasks = Array.from(sessions.values()).map((session) =>
      session.client.destroy().catch(() => undefined),
    );
    await Promise.all(tasks);
  } finally {
    process.exit(0);
  }
});
