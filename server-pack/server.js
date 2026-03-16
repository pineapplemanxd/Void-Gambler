'use strict';

const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const TICK_MS = Number(process.env.TICK_MS || 100);
const LOG_WORLD = String(process.env.LOG_WORLD || '1') !== '0';

const clients = new Map();
let hostId = '';
let hostWorld = null;
let hostWorldTs = 0;

function safeNick(v) {
  return String(v || 'Player').trim().replace(/[^a-zA-Z0-9_\- ]/g, '').slice(0, 16) || 'Player';
}

function ts() {
  return new Date().toISOString();
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function safeNum(v, min, max, fallback = 0) {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function sanitizeBullet(b) {
  if (!b || typeof b !== 'object') return null;
  const ridRaw = String(b.rid || '').trim();
  const rid = ridRaw.replace(/[^a-zA-Z0-9_\-:]/g, '').slice(0, 28);
  if (!rid) return null;
  const kind = b.kind === 'm' ? 'm' : (b.kind === 'p' ? 'p' : 'b');
  return {
    rid,
    kind,
    x: safeNum(b.x, 0, 4000, 0),
    y: safeNum(b.y, 0, 4000, 0),
    vx: safeNum(b.vx, -5000, 5000, 0),
    vy: safeNum(b.vy, -5000, 5000, 0),
    tint: safeNum(b.tint, 0, 0xffffff, 0xffffff),
    scale: Math.max(0.3, Math.min(2.5, Number(b.scale) || 1)),
  };
}

function sanitizeWorldEntity(e, isBoss) {
  if (!e || typeof e !== 'object') return null;
  const rid = String(e.rid || '').replace(/[^a-zA-Z0-9_\-:]/g, '').slice(0, 32);
  if (!rid) return null;
  const key = String(e.key || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 32) || (isBoss ? 'boss' : 'enemy');
  const out = {
    rid,
    key,
    x: safeNum(e.x, 0, 4000, 0),
    y: safeNum(e.y, 0, 4000, 0),
    hp: safeNum(e.hp, 0, 999999, 1),
    maxHp: safeNum(e.maxHp, 1, 999999, 1),
  };
  if (isBoss) {
    out.phase2 = !!e.phase2;
    out.name = String(e.name || 'Boss').slice(0, 32);
  }
  return out;
}

function sanitizeWorldPayload(w) {
  if (!w || typeof w !== 'object') return null;
  const modeRaw = w.mode && typeof w.mode === 'object' ? w.mode : {};
  const mode = {
    training: !!modeRaw.training,
    bossKey: String(modeRaw.bossKey || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 32),
    hard: !!modeRaw.hard,
  };
  const progRaw = w.progress && typeof w.progress === 'object' ? w.progress : {};
  const progress = {
    level: safeNum(progRaw.level, 1, 9999, 1),
    xp: safeNum(progRaw.xp, 0, 999999, 0),
    xpNext: safeNum(progRaw.xpNext, 2, 999999, 2),
  };
  const enemiesIn = Array.isArray(w.enemies) ? w.enemies : [];
  const bossesIn = Array.isArray(w.bosses) ? w.bosses : [];
  const enemies = [];
  const bosses = [];
  for (let i = 0; i < enemiesIn.length && enemies.length < 140; i++) {
    const item = sanitizeWorldEntity(enemiesIn[i], false);
    if (item) enemies.push(item);
  }
  for (let i = 0; i < bossesIn.length && bosses.length < 12; i++) {
    const item = sanitizeWorldEntity(bossesIn[i], true);
    if (item) bosses.push(item);
  }
  return { mode, progress, enemies, bosses };
}

function pickHostIfNeeded() {
  if (hostId) return;
  for (const state of clients.values()) {
    hostId = state.id;
    log(`HOST elected ${hostId} (${state.nick})`);
    return;
  }
}

function removeHostIfDisconnected(id) {
  if (hostId !== id) return;
  hostId = '';
  hostWorld = null;
  hostWorldTs = 0;
  log(`HOST left ${id}, waiting for re-election`);
  pickHostIfNeeded();
}

const wss = new WebSocket.Server({ host: HOST, port: PORT });

wss.on('connection', (ws) => {
  const id = genId();
  const state = {
    id,
    nick: 'Player',
    x: 2000,
    y: 2000,
    hp: 100,
    level: 1,
    lastSeen: Date.now(),
    bullets: [],
  };
  clients.set(ws, state);
  pickHostIfNeeded();
  log(`JOIN id=${id} clients=${clients.size}`);

  try {
    ws.send(JSON.stringify({ type: 'welcome', id, hostId }));
  } catch (e) {
    // no-op
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw || ''));
    } catch (e) {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    const current = clients.get(ws);
    if (!current) return;
    current.lastSeen = Date.now();

    if (msg.type === 'hello') {
      current.nick = safeNick(msg.nick);
      log(`HELLO id=${current.id} nick=${current.nick}`);
      return;
    }

    if (msg.type === 'state') {
      if (typeof msg.nick === 'string') current.nick = safeNick(msg.nick);
      if (Number.isFinite(msg.x)) current.x = safeNum(msg.x, 0, 4000, current.x);
      if (Number.isFinite(msg.y)) current.y = safeNum(msg.y, 0, 4000, current.y);
      if (Number.isFinite(msg.hp)) current.hp = safeNum(msg.hp, 0, 999999, current.hp);
      if (Number.isFinite(msg.level)) current.level = safeNum(msg.level, 1, 9999, current.level);
      if (Array.isArray(msg.bullets)) {
        const bullets = [];
        for (let i = 0; i < msg.bullets.length && bullets.length < 80; i++) {
          const b = sanitizeBullet(msg.bullets[i]);
          if (b) bullets.push(b);
        }
        current.bullets = bullets;
      }
      return;
    }

    if (msg.type === 'world') {
      if (current.id !== hostId) return;
      const world = sanitizeWorldPayload(msg.world);
      if (!world) return;
      hostWorld = world;
      hostWorldTs = Date.now();
      if (LOG_WORLD) {
        log(`WORLD host=${hostId} enemies=${world.enemies.length} bosses=${world.bosses.length} training=${world.mode.training}`);
      }
    }
  });

  ws.on('close', () => {
    log(`LEAVE id=${id} clients=${Math.max(0, clients.size - 1)}`);
    removeHostIfDisconnected(id);
    clients.delete(ws);
  });

  ws.on('error', () => {
    log(`SOCKET ERROR id=${id}`);
    removeHostIfDisconnected(id);
    clients.delete(ws);
  });
});

setInterval(() => {
  const now = Date.now();
  const players = [];

  clients.forEach((s, ws) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (now - s.lastSeen > 30000) {
      try {
        ws.close();
      } catch (e) {
        // no-op
      }
      return;
    }
    players.push({
      id: s.id,
      nick: s.nick,
      x: s.x,
      y: s.y,
      hp: s.hp,
      level: s.level,
      bullets: s.bullets,
    });
  });

  const world = hostWorld && now - hostWorldTs < 6000 ? hostWorld : null;
  const payload = JSON.stringify({ type: 'snapshot', ts: now, hostId, players, world });
  clients.forEach((_s, ws) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(payload);
    } catch (e) {
      // no-op
    }
  });
}, TICK_MS);

log(`[Void Gambler MP] listening on ws://${HOST}:${PORT}`);
