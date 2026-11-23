import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Linux-only inspection of the host (via /proc). On any other OS (e.g. local Windows dev) every
// function degrades to `supported: false` instead of throwing, so the bridge still starts.
const IS_LINUX = process.platform === "linux";
const CLOCK_TICKS_PER_SECOND = 100;
const PAGE_SIZE_BYTES = 4096;
const SINGLETON_FILES = ["SingletonLock", "SingletonSocket", "SingletonCookie"];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// "cpu  user nice system idle iowait irq softirq steal ..." -> cumulative jiffies.
export function parseCpuLine(text) {
  const line = String(text).split("\n").find((item) => item.startsWith("cpu "));
  if (!line) return null;

  const values = line.trim().split(/\s+/).slice(1).map(Number);
  if (values.length < 8 || values.some((value) => !Number.isFinite(value))) return null;

  const total = values.slice(0, 8).reduce((sum, value) => sum + value, 0);
  return { total, steal: values[7], idle: values[3] + values[4] };
}

export function cpuPercentagesBetween(before, after) {
  if (!before || !after) return null;

  const total = after.total - before.total;
  if (total <= 0) return null;

  return {
    stealPercent: round(((after.steal - before.steal) / total) * 100),
    busyPercent: round(100 - ((after.idle - before.idle) / total) * 100),
  };
}

// /proc/<pid>/stat: "pid (comm) state ppid ..." where comm may itself contain spaces/parens, so
// everything is located relative to the LAST ")".
export function parseProcStat(text) {
  const raw = String(text);
  const open = raw.indexOf("(");
  const close = raw.lastIndexOf(")");
  if (open < 0 || close < open) return null;

  const fields = raw.slice(close + 2).trim().split(/\s+/);
  const utime = Number(fields[11]);
  const stime = Number(fields[12]);
  const startTime = Number(fields[19]);
  const rssPages = Number(fields[21]);
  const ppid = Number(fields[1]);
  if ([utime, stime, startTime, rssPages, ppid].some((value) => !Number.isFinite(value))) return null;

  return {
    pid: Number(raw.slice(0, open).trim()),
    comm: raw.slice(open + 1, close),
    ppid,
    cpuTicks: utime + stime,
    startTicks: startTime,
    rssBytes: rssPages * PAGE_SIZE_BYTES,
  };
}

export function parseMeminfo(text) {
  const map = {};
  for (const line of String(text).split("\n")) {
    const match = /^(\w+):\s+(\d+)\s*kB/.exec(line);
    if (match) map[match[1]] = Number(match[2]) * 1024;
  }

  return {
    memTotal: map.MemTotal ?? 0,
    memAvailable: map.MemAvailable ?? map.MemFree ?? 0,
    swapTotal: map.SwapTotal ?? 0,
    swapUsed: (map.SwapTotal ?? 0) - (map.SwapFree ?? 0),
  };
}

export function extractFlag(cmdline, flag) {
  const prefix = `--${flag}=`;
  const part = cmdline.split("\0").find((item) => item.startsWith(prefix));
  return part ? part.slice(prefix.length) : null;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function toMb(bytes) {
  return Math.round(bytes / (1024 * 1024));
}

async function readText(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function scanProcesses() {
  let entries;
  try {
    entries = await fs.readdir("/proc");
  } catch {
    return new Map();
  }

  const pids = entries.filter((name) => /^\d+$/.test(name));
  const result = new Map();

  await Promise.all(
    pids.map(async (pid) => {
      const text = await readText(`/proc/${pid}/stat`);
      const parsed = text ? parseProcStat(text) : null;
      if (parsed) result.set(Number(pid), parsed);
    }),
  );

  return result;
}

// Maps a Chromium profile directory back to the bridge session id. LocalAuth stores each session
// under "<dataPath>/session-<clientId>", so "session-user-1" belongs to session "user-1".
export function sessionIdFromProfileDir(profileDir) {
  const base = path.basename(profileDir);
  return base.startsWith("session-") ? base.slice("session-".length) : base;
}

// Only Chromium instances launched with a profile under OUR auth folder are ever inspected or
// killed - never some other app's Chrome/Puppeteer that happens to run on the same server.
function isOwnProfile(profileDir, authRoot) {
  if (!profileDir) return false;
  const relative = path.relative(authRoot, profileDir);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Samples the host for ~1s and returns CPU/memory/swap numbers, the heaviest processes and every
 * Chromium process grouped by session profile. `authRoot` is the bridge's .wwebjs_auth folder.
 */
export async function collectSystemSnapshot(authRoot, sampleMs = 1000) {
  const base = {
    supported: IS_LINUX,
    cpuCount: os.cpus().length,
    loadAverage: os.loadavg().map(round),
    hostUptimeSeconds: Math.round(os.uptime()),
  };

  if (!IS_LINUX) {
    return {
      ...base,
      memory: { totalMb: toMb(os.totalmem()), availableMb: toMb(os.freemem()), swapTotalMb: 0, swapUsedMb: 0 },
      cpu: null,
      topProcesses: [],
      chromeProfiles: [],
    };
  }

  const cpuBefore = parseCpuLine((await readText("/proc/stat")) ?? "");
  const procsBefore = await scanProcesses();
  await delay(sampleMs);
  const cpuAfter = parseCpuLine((await readText("/proc/stat")) ?? "");
  const procsAfter = await scanProcesses();

  const meminfo = parseMeminfo((await readText("/proc/meminfo")) ?? "");
  const hostUptime = Number(((await readText("/proc/uptime")) ?? "0").split(" ")[0]) || 0;
  const intervalSeconds = sampleMs / 1000;

  const processes = [];
  for (const [pid, after] of procsAfter) {
    const before = procsBefore.get(pid);
    const cpuPercent =
      before && before.startTicks === after.startTicks
        ? round(((after.cpuTicks - before.cpuTicks) / CLOCK_TICKS_PER_SECOND / intervalSeconds) * 100)
        : 0;

    processes.push({
      pid,
      ppid: after.ppid,
      comm: after.comm,
      cpuPercent,
      memMb: toMb(after.rssBytes),
      uptimeSeconds: Math.max(0, Math.round(hostUptime - after.startTicks / CLOCK_TICKS_PER_SECOND)),
    });
  }

  const chromeProcesses = processes.filter((item) => item.comm.startsWith("chrome"));
  const profiles = new Map();

  await Promise.all(
    chromeProcesses.map(async (proc) => {
      const cmdline = (await readText(`/proc/${proc.pid}/cmdline`)) ?? "";
      const profileDir = extractFlag(cmdline, "user-data-dir");
      if (!isOwnProfile(profileDir, authRoot)) return;

      const isMain = !cmdline.split("\0").some((item) => item.startsWith("--type="));
      let group = profiles.get(profileDir);
      if (!group) {
        group = {
          profileDir,
          sessionId: sessionIdFromProfileDir(profileDir),
          pids: [],
          mainPids: [],
          processCount: 0,
          cpuPercent: 0,
          memMb: 0,
        };
        profiles.set(profileDir, group);
      }

      group.pids.push(proc.pid);
      if (isMain) group.mainPids.push(proc.pid);
      group.processCount += 1;
      group.cpuPercent = round(group.cpuPercent + proc.cpuPercent);
      group.memMb += proc.memMb;
    }),
  );

  const sessionByPid = new Map();
  for (const group of profiles.values()) {
    for (const pid of group.pids) sessionByPid.set(pid, group.sessionId);
  }

  const top = processes
    .filter((item) => item.cpuPercent > 0)
    .sort((a, b) => b.cpuPercent - a.cpuPercent)
    .slice(0, 10);

  const topProcesses = await Promise.all(
    top.map(async (item) => {
      const cmdline = ((await readText(`/proc/${item.pid}/cmdline`)) ?? "").split("\0").filter(Boolean);
      return {
        pid: item.pid,
        name: item.comm,
        cpuPercent: item.cpuPercent,
        memMb: item.memMb,
        uptimeSeconds: item.uptimeSeconds,
        sessionId: sessionByPid.get(item.pid) ?? null,
        detail: describeProcess(item.comm, cmdline),
      };
    }),
  );

  return {
    ...base,
    cpu: cpuPercentagesBetween(cpuBefore, cpuAfter),
    memory: {
      totalMb: toMb(meminfo.memTotal),
      availableMb: toMb(meminfo.memAvailable),
      swapTotalMb: toMb(meminfo.swapTotal),
      swapUsedMb: toMb(meminfo.swapUsed),
    },
    topProcesses,
    chromeProfiles: Array.from(profiles.values()).map((group) => ({
      profileDir: group.profileDir,
      sessionId: group.sessionId,
      processCount: group.processCount,
      mainProcessCount: group.mainPids.length,
      cpuPercent: group.cpuPercent,
      memMb: group.memMb,
    })),
  };
}

const LEGACY_ID = (id) => !/^user-\d+$/.test(id);
const LEVEL_ORDER = { danger: 0, warning: 1, info: 2, ok: 3 };

/**
 * Turns raw numbers into plain-language findings, each optionally carrying the repair action the
 * panel can offer (cleanup-chrome / restart-session / remove-session). Pure function: no I/O.
 *   snapshot: result of collectSystemSnapshot
 *   sessions: [{ id, status, lastError }]
 */
export function buildFindings(snapshot, sessions) {
  const findings = [];
  const add = (level, id, title, detail, action = null) =>
    findings.push({ id, level, title, detail, action });

  const sessionIds = new Set(sessions.map((item) => item.id));

  if (!snapshot.supported) {
    add(
      "info",
      "unsupported-os",
      "Leitura detalhada do servidor indisponível neste sistema",
      "CPU, memória e processos Chrome só são lidos em servidores Linux (produção). Aqui só as sessões do WhatsApp são listadas.",
    );
  }

  const steal = snapshot.cpu?.stealPercent;
  if (typeof steal === "number" && steal >= 10) {
    add(
      steal >= 25 ? "danger" : "warning",
      "cpu-steal",
      `O provedor da VPS está limitando a CPU (steal ${steal}%)`,
      "Steal é CPU que o servidor físico da hospedagem tira da sua máquina virtual. Reiniciar não resolve: reduza as sessões ativas (remova as que não usa), reconecte uma de cada vez ou aumente o plano.",
    );
  }

  const loadPerCore = snapshot.cpuCount > 0 ? snapshot.loadAverage[0] / snapshot.cpuCount : 0;
  if (snapshot.supported && loadPerCore >= 1) {
    add(
      loadPerCore >= 2 ? "danger" : "warning",
      "high-load",
      `Carga do servidor alta (${snapshot.loadAverage[0]} em ${snapshot.cpuCount} núcleos)`,
      "Mais processos querendo CPU do que o servidor consegue atender. Veja na tabela de processos quem mais consome. Logo depois de reiniciar o bridge é normal subir por alguns minutos (as sessões sincronizam o histórico).",
    );
  }

  const { totalMb, availableMb, swapTotalMb, swapUsedMb } = snapshot.memory;
  if (snapshot.supported && totalMb > 0) {
    const availablePercent = (availableMb / totalMb) * 100;
    if (availablePercent < 20) {
      add(
        availablePercent < 10 ? "danger" : "warning",
        "low-memory",
        `Pouca memória disponível (${Math.round(availablePercent)}%)`,
        "Cada sessão do WhatsApp mantém um Chrome inteiro aberto. Remova sessões que não usa ou reinicie o bridge para liberar memória.",
      );
    }
  }
  if (snapshot.supported && swapTotalMb > 0 && swapUsedMb / swapTotalMb >= 0.9) {
    add(
      "warning",
      "swap-full",
      `Swap quase cheio (${swapUsedMb} de ${swapTotalMb} MB)`,
      "O servidor está usando disco como memória, o que deixa tudo lento. O swap só esvazia aos poucos depois que a memória é liberada.",
    );
  }

  for (const profile of snapshot.chromeProfiles) {
    if (!sessionIds.has(profile.sessionId)) {
      add(
        "danger",
        `orphan-${profile.sessionId}`,
        `Chrome órfão da sessão "${profile.sessionId}" (${profile.processCount} processos)`,
        "Esses processos não pertencem a nenhuma sessão ativa do bridge. Consomem CPU e memória à toa e podem impedir a sessão de reconectar (\"browser is already running\").",
        { type: "cleanup-chrome" },
      );
    } else if (profile.mainProcessCount > 1) {
      add(
        "danger",
        `duplicate-${profile.sessionId}`,
        `Sessão "${profile.sessionId}" com ${profile.mainProcessCount} Chromes principais`,
        "Sinal de vazamento: um navegador antigo ficou vivo quando abriu o novo. Reiniciar a sessão fecha todos e abre só um.",
        { type: "restart-session", sessionId: profile.sessionId },
      );
    } else if (profile.cpuPercent >= 120) {
      add(
        "warning",
        `hot-${profile.sessionId}`,
        `Sessão "${profile.sessionId}" usando muita CPU (${profile.cpuPercent}%)`,
        "Pode ser a sincronização inicial logo após conectar (normal por alguns minutos). Se continuar assim depois disso, reinicie a sessão.",
        { type: "restart-session", sessionId: profile.sessionId },
      );
    }
  }

  for (const session of sessions) {
    if (session.status === "error") {
      const locked = /browser is already running/i.test(session.lastError ?? "");
      add(
        "danger",
        `error-${session.id}`,
        `Sessão "${session.id}" com erro`,
        locked
          ? "O Chrome anterior ficou preso na pasta da sessão (\"browser is already running\"), por isso não sai QR Code. Reiniciar a sessão mata o Chrome preso e limpa o bloqueio."
          : `Erro: ${session.lastError ?? "desconhecido"}. Reiniciar a sessão costuma resolver.`,
        { type: "restart-session", sessionId: session.id },
      );
    }

    if (LEGACY_ID(session.id)) {
      add(
        "warning",
        `legacy-${session.id}`,
        `Sessão legada "${session.id}" ocupando recursos`,
        "Sessões que não seguem o padrão user-<número> não têm dono: a API descarta toda mensagem delas. Se não é um teste em uso, remova para liberar um Chrome inteiro.",
        { type: "remove-session", sessionId: session.id },
      );
    }

    if (session.status === "qr-required") {
      add(
        "info",
        `qr-${session.id}`,
        `Sessão "${session.id}" aguardando leitura do QR Code`,
        "O dono precisa abrir Meu WhatsApp no sistema e escanear o QR Code com o celular.",
      );
    }
  }

  if (findings.length === 0) {
    add("ok", "all-good", "Nenhum problema encontrado", "CPU, memória e sessões estão dentro do esperado.");
  }

  return findings.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

function describeProcess(comm, cmdline) {
  if (cmdline.length === 0) return "";
  if (comm.startsWith("chrome")) return "";
  const meaningful = cmdline.filter((item) => !item.startsWith("-"));
  return meaningful.slice(0, 2).join(" ").slice(0, 120);
}

/**
 * Kills every Chromium process (main, renderers, GPU, zygotes...) that was launched with the
 * given profile directory, then removes the Singleton* lock files Chromium leaves behind - a stale
 * lock is what makes the next launch fail with "The browser is already running for <dir>".
 */
export async function killProfileProcesses(profileDir, authRoot) {
  const result = { killedPids: [], removedLocks: [] };
  if (!isOwnProfile(profileDir, authRoot)) return result;

  if (IS_LINUX) {
    const procs = await scanProcesses();
    for (const [pid, proc] of procs) {
      if (!proc.comm.startsWith("chrome")) continue;

      const cmdline = (await readText(`/proc/${pid}/cmdline`)) ?? "";
      if (extractFlag(cmdline, "user-data-dir") !== profileDir) continue;

      try {
        process.kill(pid, "SIGKILL");
        result.killedPids.push(pid);
      } catch {
        // already gone
      }
    }

    if (result.killedPids.length > 0) await delay(300);
  }

  for (const name of SINGLETON_FILES) {
    const file = path.join(profileDir, name);
    try {
      await fs.lstat(file);
      await fs.rm(file, { force: true });
      result.removedLocks.push(name);
    } catch {
      // not present
    }
  }

  return result;
}
