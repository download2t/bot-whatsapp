import "dotenv/config";
import express from "express";
import cors from "cors";
import axios from "axios";
import qrcode from "qrcode";
import whatsappWebJs from "whatsapp-web.js";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFindings,
  collectSystemSnapshot,
  killProfileProcesses,
  sessionIdFromProfileDir,
} from "./system.js";

const { Client, LocalAuth, MessageMedia } = whatsappWebJs;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSIONS_STATE_FILE = path.join(__dirname, ".sessions.json");
const AUTH_ROOT = path.join(__dirname, ".wwebjs_auth");
const AUTH_TIMEOUT_MS = Number(process.env.WA_AUTH_TIMEOUT_MS) > 0 ? Number(process.env.WA_AUTH_TIMEOUT_MS) : 120000;
const WA_CACHE_DIR = path.join(__dirname, ".wwebjs_cache");
const WA_WEB_ARCHIVE_URL = "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html";

// WhatsApp ships a new WhatsApp Web build every few hours, and whatsapp-web.js occasionally can't
// drive a new one (e.g. an internal module it needs is renamed). The result is a session that
// loads but never reaches a usable state, so no QR code. WA_WEB_VERSION pins a build that is
// known to work: served from the local cache if that build was saved there, otherwise downloaded
// from the public wppconnect-team/wa-version archive. Unset = live version (default behavior).
function webVersionOptions() {
  const pinned = (process.env.WA_WEB_VERSION ?? "").trim();
  if (!pinned) {
    return { webVersionCache: { type: "local", path: WA_CACHE_DIR } };
  }

  // The value becomes a file name and a URL segment, so only accept real version strings.
  if (!/^\d+(\.\d+)*(-[A-Za-z]+)?$/.test(pinned)) {
    console.log(`[WA] WA_WEB_VERSION inválida ("${pinned}") — ignorando e usando a versão atual do WhatsApp Web.`);
    return { webVersionCache: { type: "local", path: WA_CACHE_DIR } };
  }

  const cachedLocally = existsSync(path.join(WA_CACHE_DIR, `${pinned}.html`));
  return {
    webVersion: pinned,
    webVersionCache: cachedLocally
      ? { type: "local", path: WA_CACHE_DIR }
      : { type: "remote", remotePath: WA_WEB_ARCHIVE_URL },
  };
}

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

// client.sendMessage() can resolve successfully (with a real message id) purely from the local
// Puppeteer page state even when the session is actually a zombie - e.g. WhatsApp blocked or
// remotely logged out the number while the browser page/Chromium process stayed alive. Without
// this, callers had no way to tell "WhatsApp's servers actually received it" apart from "the
// in-page JS call returned", which is exactly how a bulk campaign ended up marking recipients as
// Sent for messages that were never really delivered. ack code 1+ means WhatsApp's own servers
// acknowledged the message; -1 means WhatsApp itself reported failure.
const SEND_CONFIRMATION_TIMEOUT_MS = 20000;
const pendingSendConfirmations = new Map();

function waitForSendConfirmation(messageId, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingSendConfirmations.delete(messageId);
      resolve({ confirmed: false, ackStatus: null, timedOut: true });
    }, timeoutMs);

    pendingSendConfirmations.set(messageId, (ackCode, ackStatus) => {
      clearTimeout(timer);
      pendingSendConfirmations.delete(messageId);
      resolve({ confirmed: ackCode >= 1, ackStatus, timedOut: false });
    });
  });
}

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

// A session that keeps getting disconnected (e.g. WhatsApp logs it out right after every launch)
// would otherwise be relaunched forever, piling Chromium start-ups on top of each other. History is
// keyed by session id because restartSessionById replaces the session object each time.
const MAX_AUTO_RESTARTS = 3;
const AUTO_RESTART_WINDOW_MS = 5 * 60 * 1000;
const autoRestartHistory = new Map();

function allowAutoRestart(sessionId) {
  const now = Date.now();
  const recent = (autoRestartHistory.get(sessionId) ?? []).filter((at) => now - at < AUTO_RESTART_WINDOW_MS);
  if (recent.length >= MAX_AUTO_RESTARTS) {
    autoRestartHistory.set(sessionId, recent);
    return false;
  }

  recent.push(now);
  autoRestartHistory.set(sessionId, recent);
  return true;
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
  return path.join(AUTH_ROOT, `session-${sessionId}`);
}

// Chromium spawns many child processes (renderers, GPU, zygotes). Killing only the main one leaves
// the children alive holding the profile folder, and the next launch then fails with "The browser
// is already running for <dir>" - so no QR code ever shows up. This kills the whole family for a
// session's profile and clears the stale Singleton* lock files.
async function killSessionChromium(sessionId) {
  try {
    const result = await killProfileProcesses(getAuthSessionDir(sessionId), AUTH_ROOT);
    if (result.killedPids.length > 0 || result.removedLocks.length > 0) {
      console.log(
        `[SESSION] ${sessionId}: limpeza do Chromium — ${result.killedPids.length} processo(s) finalizado(s), locks removidos: ${result.removedLocks.join(", ") || "nenhum"}.`,
      );
    }
    return result;
  } catch (error) {
    console.log(`[SESSION] ${sessionId}: falha na limpeza do Chromium — ${error?.message ?? error}`);
    return { killedPids: [], removedLocks: [] };
  }
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
    // Which WhatsApp Web build to load. Unset = whatever WhatsApp serves live right now. Set
    // WA_WEB_VERSION to pin a known-good build (see webVersionOptions) - needed when WhatsApp ships
    // a build that this library can't drive yet.
    ...webVersionOptions(),
    // How long inject() waits for WhatsApp Web to load and reach a usable state before giving up
    // ("Waiting failed: 30000ms exceeded" was the library default). Loading WhatsApp Web in a
    // headless Chrome on a throttled VPS can take well over 30s.
    authTimeoutMs: AUTH_TIMEOUT_MS,
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
    console.log(`[STATUS] Sessão ${sessionId}: QR Code gerado — aguardando leitura.`);
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
    console.log(`[STATUS] Sessão ${sessionId}: desconectada (motivo: ${reason}, manual=${session.manualDisconnect}).`);
    session.status = "disconnected";
    session.lastError = reason;
    session.clientReady = false;
    session.qrDataUrl = null;
    session.clientAlive = false;

    // Client.initialize() (whatsapp-web.js) always calls puppeteer.launch() and overwrites
    // this.pupBrowser unconditionally - it never closes whatever browser was there before. Just
    // calling initializeSessionIfNeeded(session) here would reinitialize this same (now-stale)
    // client and silently orphan its current Chromium process tree (main + renderer/utility
    // children) with no reference left anywhere to close it - exactly what was piling up zombie
    // Chrome processes across restarts/network blips. Route through restartSessionById instead,
    // which destroys the old client (closeClientSafely, with a force-kill fallback if it hangs)
    // before building a fresh session/client - the same safe path /session/:id/restart uses.
    if (!session.manualDisconnect) {
      if (!allowAutoRestart(sessionId)) {
        session.status = "error";
        session.lastError = `Desconectada repetidamente (último motivo: ${reason}). A reconexão automática foi pausada para não ficar em loop — reinicie a sessão pela tela Saúde do Sistema.`;
        console.log(`[STATUS] Sessão ${sessionId}: ${MAX_AUTO_RESTARTS} reconexões automáticas em ${AUTO_RESTART_WINDOW_MS / 60000} min — pausando para evitar loop.`);
        return;
      }

      setTimeout(() => {
        void restartSessionById(sessionId);
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

      // Resolve any /messages/send call waiting on confirmation for this message, regardless of
      // whether we can also forward it to the API below - the caller needs this signal even if
      // owner/messageId resolution for the webhook forward fails for some reason.
      const waitingMessageId = message.id?._serialized;
      if (waitingMessageId && pendingSendConfirmations.has(waitingMessageId)) {
        pendingSendConfirmations.get(waitingMessageId)(Number(ack), ackStatus ?? null);
      }

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

// whatsapp-web.js's client.destroy()/logout() can hang indefinitely if the underlying
// Puppeteer/Chromium process is wedged (we've directly observed orphaned chrome.exe processes
// from exactly this in this project). Without a hard timeout here, an `await` on either call
// never resolves, so session.clientAlive never gets reset back to false — and
// initializeSessionIfNeeded()'s guard ("if clientAlive, do nothing") then permanently refuses
// to start a new session/QR for that id, no matter how many times connect/disconnect is
// retried from the UI. This wraps the call with a bounded wait and, if it doesn't settle in
// time, force-kills the underlying Chromium process directly as a fallback.
const CLIENT_CLOSE_TIMEOUT_MS = 8000;

async function closeClientSafely(session, methodName) {
  let settled = false;

  const attempt = session.client[methodName]()
    .catch(() => {})
    .finally(() => {
      settled = true;
    });

  await Promise.race([attempt, delay(CLIENT_CLOSE_TIMEOUT_MS)]);

  if (!settled) {
    console.log(
      `[SESSION] ${session.id}: client.${methodName}() não respondeu em ${CLIENT_CLOSE_TIMEOUT_MS}ms — forçando encerramento do Chromium.`,
    );
    try {
      const proc = session.client.pupBrowser?.process?.();
      if (proc && !proc.killed) {
        proc.kill("SIGKILL");
        console.log(`[SESSION] ${session.id}: processo do Chromium (pid=${proc.pid}) finalizado à força.`);
      }
    } catch (killError) {
      console.log(`[SESSION] ${session.id}: falha ao tentar matar o processo do Chromium — ${killError?.message ?? killError}`);
    }

    await killSessionChromium(session.id);
  }
}

async function restartSessionById(id) {
  const sessionId = normalizeSessionId(id);
  const previous = sessions.get(sessionId);
  if (!previous) {
    return null;
  }

  previous.manualDisconnect = true;
  await closeClientSafely(previous, "destroy");
  await killSessionChromium(sessionId);

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
  await closeClientSafely(session, "logout");
  await closeClientSafely(session, "destroy");
  await killSessionChromium(sessionId);

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
    try {
      await session.client.initialize();
    } catch (error) {
      if (!/browser is already running/i.test(error?.message ?? "")) {
        throw error;
      }

      // A previous Chromium for this same profile survived (e.g. after a forced kill) and is
      // locking it. Nothing else can legitimately own this profile while we're initializing it,
      // so clear it and try once more instead of leaving the session stuck without a QR code.
      console.log(`[SESSION] ${session.id}: Chromium anterior preso na pasta da sessão — limpando e tentando de novo.`);
      await killSessionChromium(session.id);
      await session.client.initialize();
    }
    session.clientAlive = true;
  } catch (error) {
    const reason = error?.message || String(error ?? "") || "Unable to initialize WhatsApp client";
    const page = await describePageState(session);

    session.lastError = page
      ? `${reason} | Página: WhatsApp Web ${page.waVersion ?? "não carregou"}, socket=${page.socketState ?? "indisponível"}, online=${page.online}, título="${page.title}"`
      : reason;
    session.status = "error";
    console.log(`[SESSION] ${session.id}: falha ao iniciar — ${reason}${page ? ` — estado da página: ${JSON.stringify(page)}` : " — página indisponível"}`);

    // A failed initialize() can leave the Chromium it launched running. Close it now so every
    // failed attempt doesn't pile up another idle Chrome (and doesn't keep locking the profile).
    const previousManualDisconnect = session.manualDisconnect;
    session.manualDisconnect = true;
    try {
      await closeClientSafely(session, "destroy");
      await killSessionChromium(session.id);
    } finally {
      session.manualDisconnect = previousManualDisconnect;
    }
  } finally {
    session.isInitializing = false;
  }
}

// Snapshot of what the WhatsApp Web page looks like right now, to explain WHY an initialization
// timed out (bundle never loaded, internal module missing, socket stuck connecting, no network...).
async function describePageState(session) {
  const page = session.client?.pupPage;
  if (!page) {
    return null;
  }

  try {
    return await Promise.race([
      page.evaluate(() => {
        let socketState = null;
        try {
          socketState = window.require?.("WAWebSocketModel")?.Socket?.state ?? null;
        } catch (error) {
          socketState = `erro: ${error?.message ?? error}`;
        }

        return {
          waVersion: window.Debug?.VERSION ?? null,
          hasRequire: typeof window.require === "function",
          socketState,
          online: navigator.onLine,
          title: document.title,
          url: location.href,
          text: (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 160),
        };
      }),
      delay(5000).then(() => null),
    ]);
  } catch {
    return null;
  }
}

async function disconnectSession(session, { logout = false } = {}) {
  session.manualDisconnect = true;

  await closeClientSafely(session, logout ? "logout" : "destroy");

  // Unconditional — must run even if the client close above hung and had to be forced, so a
  // stuck disconnect can never leave the session unable to start a fresh one afterwards.
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

    // When the page is sluggish/frozen the lookup above can sit there for minutes. If the API has
    // already given up by then, it recorded this as failed — sending now would deliver a message
    // nobody knows about (and duplicate it if the user resends).
    if (res.destroyed) {
      console.log(`[SEND] Sessão ${sessionId}: a API já desistiu desta requisição — mensagem para ${target} NÃO será enviada.`);
      return;
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

    // Callers that need to trust the "sent" result for record-keeping (e.g. a bulk campaign
    // marking a recipient as Sent) can opt into waiting for WhatsApp's own server ack instead of
    // trusting that sendMessage() merely resolved — see the SEND_CONFIRMATION_TIMEOUT_MS comment
    // above for why that alone isn't proof of real delivery.
    if (Boolean(req.body?.confirmDelivery) && result?.id?._serialized) {
      const confirmation = await waitForSendConfirmation(result.id._serialized, SEND_CONFIRMATION_TIMEOUT_MS);
      if (!confirmation.confirmed) {
        console.log(
          `[SEND] Sessão ${sessionId}: mensagem ${result.id._serialized} para ${target} NÃO confirmada pelo WhatsApp em ${SEND_CONFIRMATION_TIMEOUT_MS}ms (timedOut=${confirmation.timedOut}, ackStatus=${confirmation.ackStatus ?? "nenhum"}) — tratando como falha em vez de Sent.`,
        );
        return res.status(502).json({
          success: false,
          sessionId: senderSession.id,
          messageId: result.id._serialized,
          error: confirmation.ackStatus === "error"
            ? "WhatsApp recusou a mensagem (ack de erro)."
            : "Mensagem não confirmada pelo WhatsApp — a sessão pode estar bloqueada ou desconectada. Use o reset de emergência e reconecte.",
        });
      }
    }

    let unreadApplied = false;
    let unreadError = null;
    let unreadProbe = null;
    if (Boolean(markAsUnread)) {
      try {
        const chat = await senderSession.client.getChatById(target);
        if (chat && typeof chat.markUnread === "function") {
          await chat.markUnread();
          unreadApplied = true;
        } else {
          unreadError = "chat.markUnread is not a function on the resolved chat object.";
        }
      } catch (error) {
        unreadApplied = false;
        // The in-page error thrown by WhatsApp Web's own (minified) bundle usually has an
        // unhelpful one-letter .message — the probe below inspects the actual live objects our
        // call depends on, so we know exactly which reference broke instead of guessing.
        unreadError = error?.message ?? String(error);
        console.log(`[SEND] Sessão ${sessionId}: markUnread falhou para ${target}: ${unreadError}`);

        try {
          unreadProbe = await senderSession.client.pupPage.evaluate(async (chatId) => {
            const out = {};
            try {
              const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
              out.chatFound = Boolean(chat);
              out.chatKeys = chat ? Object.keys(chat).slice(0, 40) : null;
              out.markedUnread = chat ? chat.markedUnread : undefined;
              // WhatsApp Web 2.3000.104xxxx renamed message-key _serialized to $1 in some
              // places (see wwebjs/whatsapp-web.js PR #201850) — check if chat.id suffered the
              // same rename, which would explain Cmd.markChatUnread crashing internally even
              // though the chat and the Cmd module both resolve fine on our side.
              out.chatIdKeys = chat?.id ? Object.keys(chat.id) : null;
              out.chatIdSerialized = chat?.id?._serialized ?? null;
              out.chatIdDollar1 = chat?.id?.$1 ?? null;
              out.isLidChat = typeof chat?.id?._serialized === "string" && chat.id._serialized.includes("@lid");
            } catch (e) {
              out.getChatError = e?.message ?? String(e);
            }
            try {
              const cmdModule = window.require("WAWebCmd");
              out.cmdModuleFound = Boolean(cmdModule);
              out.cmdKeys = cmdModule ? Object.keys(cmdModule).slice(0, 40) : null;
              out.cmdHasMarkChatUnread = Boolean(cmdModule?.Cmd?.markChatUnread);
            } catch (e) {
              out.cmdModuleError = e?.message ?? String(e);
            }
            return out;
          }, target);
          console.log(`[SEND] Sessão ${sessionId}: markUnread probe: ${JSON.stringify(unreadProbe)}`);
        } catch (probeError) {
          unreadProbe = { probeFailed: probeError?.message ?? String(probeError) };
        }
      }
    }

    return res.json({
      success: true,
      sessionId: senderSession.id,
      sourceWhatsAppNumber: senderSession.phoneNumber,
      messageId: result?.id?._serialized ?? null,
      unreadProbe,
      unreadApplied,
      unreadError,
    });
  } catch (error) {
    console.log(`[SEND] Falha ao enviar mensagem: ${error?.stack ?? error?.message ?? error}`);
    return res.status(500).json({ error: error?.message ?? "Send failed" });
  }
});

// ---------------------------------------------------------------------------------------------
// Maintenance endpoints used by the "Saúde do Sistema" panel. They can kill processes and restart
// the service, so unlike the rest of this bridge they require the shared secret (the same value as
// BACKEND_WEBHOOK_TOKEN / WhatsApp:WebhookToken on the API). The API only forwards to them for
// authenticated admins.
// ---------------------------------------------------------------------------------------------
const BRIDGE_SERVICE_NAME = process.env.BRIDGE_SERVICE_NAME ?? "mydev_bridge";

function adminTokenMatches(provided) {
  const a = Buffer.from(String(provided ?? ""));
  const b = Buffer.from(backendWebhookToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdminToken(req, res, next) {
  if (!adminTokenMatches(req.get("X-Webhook-Token"))) {
    return res.status(401).json({ error: "Invalid admin token" });
  }
  next();
}

async function canRestartViaSystemd() {
  if (process.platform !== "linux" || !/^[\w.@-]+$/.test(BRIDGE_SERVICE_NAME)) {
    return false;
  }

  return fs
    .access("/run/systemd/system")
    .then(() => true)
    .catch(() => false);
}

app.get("/admin/health", requireAdminToken, async (_req, res) => {
  try {
    const sessionList = Array.from(sessions.values()).map((item) => ({
      id: item.id,
      status: item.status,
      isConnected: item.clientReady,
      hasQr: Boolean(item.qrDataUrl),
      lastError: item.lastError,
      ownerUserId: extractOwnerUserId(item.id),
    }));

    const system = await collectSystemSnapshot(AUTH_ROOT);
    const findings = buildFindings(system, sessionList);
    const profileBySession = new Map(system.chromeProfiles.map((item) => [item.sessionId, item]));

    // Deliberately no phone numbers here: operational status only, never another user's data.
    return res.json({
      generatedAtUtc: new Date().toISOString(),
      bridge: {
        pid: process.pid,
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
        serviceName: BRIDGE_SERVICE_NAME,
        canRestart: await canRestartViaSystemd(),
      },
      system: {
        supported: system.supported,
        cpuCount: system.cpuCount,
        loadAverage: system.loadAverage,
        hostUptimeSeconds: system.hostUptimeSeconds,
        cpu: system.cpu,
        memory: system.memory,
        topProcesses: system.topProcesses,
      },
      sessions: sessionList.map((item) => {
        const chrome = profileBySession.get(item.id);
        return {
          ...item,
          chrome: chrome
            ? {
                processCount: chrome.processCount,
                mainProcessCount: chrome.mainProcessCount,
                cpuPercent: chrome.cpuPercent,
                memMb: chrome.memMb,
              }
            : null,
        };
      }),
      orphanChrome: system.chromeProfiles
        .filter((item) => !sessions.has(item.sessionId))
        .map((item) => ({
          sessionId: item.sessionId,
          processCount: item.processCount,
          cpuPercent: item.cpuPercent,
          memMb: item.memMb,
        })),
      findings,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message ?? "Unable to collect health data" });
  }
});

// Kills Chromium processes and removes stale lock files for every auth folder that does NOT belong
// to a live session. Never touches a session that is registered in this bridge, and never deletes
// any auth data.
app.post("/admin/cleanup-chrome", requireAdminToken, async (_req, res) => {
  try {
    let folders = [];
    try {
      folders = await fs.readdir(AUTH_ROOT, { withFileTypes: true });
    } catch {
      folders = [];
    }

    const cleaned = [];
    for (const entry of folders) {
      if (!entry.isDirectory() || !entry.name.startsWith("session-")) continue;

      const profileDir = path.join(AUTH_ROOT, entry.name);
      const sessionId = sessionIdFromProfileDir(profileDir);
      if (sessions.has(sessionId)) continue;

      const result = await killProfileProcesses(profileDir, AUTH_ROOT);
      if (result.killedPids.length > 0 || result.removedLocks.length > 0) {
        cleaned.push({
          sessionId,
          killedProcesses: result.killedPids.length,
          removedLocks: result.removedLocks,
        });
      }
    }

    // Orphans whose auth folder no longer exists at all (e.g. removed by logout-definitivo).
    const system = await collectSystemSnapshot(AUTH_ROOT, 200);
    for (const profile of system.chromeProfiles) {
      if (sessions.has(profile.sessionId) || cleaned.some((item) => item.sessionId === profile.sessionId)) continue;

      const result = await killProfileProcesses(profile.profileDir, AUTH_ROOT);
      cleaned.push({
        sessionId: profile.sessionId,
        killedProcesses: result.killedPids.length,
        removedLocks: result.removedLocks,
      });
    }

    const killedProcesses = cleaned.reduce((sum, item) => sum + item.killedProcesses, 0);
    console.log(`[ADMIN] cleanup-chrome: ${killedProcesses} processo(s) Chrome órfão(s) finalizado(s) em ${cleaned.length} pasta(s).`);
    return res.json({ ok: true, killedProcesses, cleaned });
  } catch (error) {
    return res.status(500).json({ error: error?.message ?? "Cleanup failed" });
  }
});

app.post("/admin/restart-bridge", requireAdminToken, async (_req, res) => {
  if (!(await canRestartViaSystemd())) {
    return res.status(501).json({
      error: "Reinício automático indisponível aqui (só funciona no servidor Linux com systemd). Reinicie manualmente.",
    });
  }

  console.log(`[ADMIN] restart-bridge solicitado — reiniciando o serviço ${BRIDGE_SERVICE_NAME}.`);
  res.status(202).json({ ok: true, service: BRIDGE_SERVICE_NAME });

  res.on("finish", () => {
    setTimeout(() => {
      const child = spawn("systemctl", ["restart", BRIDGE_SERVICE_NAME], {
        detached: true,
        stdio: "ignore",
      });
      child.on("error", (error) => {
        console.log(`[ADMIN] falha ao executar systemctl restart: ${error?.message ?? error}`);
      });
      child.unref();
    }, 300);
  });
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

// `systemctl stop` (used by deploy.sh) sends SIGTERM, not SIGINT — this used to only listen for
// SIGINT, so on a normal deploy stop this handler never ran at all, and shutdown fell through to
// systemd's default: SIGTERM to the whole cgroup (Node + every Puppeteer/Chromium child process
// together), then wait up to TimeoutStopSec (90s by default, not overridden in the systemd unit)
// before SIGKILL. Chromium doesn't always exit promptly on SIGTERM, so that 90s wait is exactly
// what made "Parando serviços" in deploy.sh occasionally hang for a long time.
// closeClientSafely() (used for the HTTP disconnect/restart routes) already solves this - bounded
// wait, then force-kills the underlying Chromium process directly if it's wedged - it just wasn't
// wired up here. Using it here too bounds shutdown to a few seconds even in the worst case.
async function shutdown() {
  try {
    const tasks = Array.from(sessions.values()).map((session) =>
      closeClientSafely(session, "destroy"),
    );
    await Promise.all(tasks);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
