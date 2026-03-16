'use strict';

const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const TICK_MS = Number(process.env.TICK_MS || 100);

const clients = new Map();

function safeNick(v) {
  return String(v || 'Player').trim().replace(/[^a-zA-Z0-9_\- ]/g, '').slice(0, 16) || 'Player';
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
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
  };
  clients.set(ws, state);

  try {
    ws.send(JSON.stringify({ type: 'welcome', id }));
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
      return;
    }

    if (msg.type === 'state') {
      if (typeof msg.nick === 'string') current.nick = safeNick(msg.nick);
      if (Number.isFinite(msg.x)) current.x = Math.max(0, Math.min(4000, Math.floor(msg.x)));
      if (Number.isFinite(msg.y)) current.y = Math.max(0, Math.min(4000, Math.floor(msg.y)));
      if (Number.isFinite(msg.hp)) current.hp = Math.max(0, Math.min(999999, Math.floor(msg.hp)));
      if (Number.isFinite(msg.level)) current.level = Math.max(1, Math.min(9999, Math.floor(msg.level)));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('error', () => {
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
    });
  });

  const payload = JSON.stringify({ type: 'snapshot', ts: now, players });
  clients.forEach((_s, ws) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(payload);
    } catch (e) {
      // no-op
    }
  });
}, TICK_MS);

console.log(`[Void Gambler MP] listening on ws://${HOST}:${PORT}`);
