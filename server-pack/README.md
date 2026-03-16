# Void Gambler Multiplayer Server Pack

This server pack runs a websocket multiplayer relay for desktop clients.
It is Node.js based and works on ARM (for example ARM64 Linux VPS or SBC).

## Requirements

- Node.js 18+
- Open TCP port (default: 8080)

## Install

```bash
cd server-pack
npm install
```

## Run

```bash
npm start
```

By default it listens on `ws://0.0.0.0:8080`.

You can customize:

```bash
PORT=8080 HOST=0.0.0.0 TICK_MS=100 npm start
```

Logging options:

```bash
LOG_WORLD=1 npm start
```

- `LOG_WORLD=1` logs host world snapshots (enemy/boss counts + training flag).
- `LOG_WORLD=0` keeps only connection/host lifecycle logs.

## Connect from client

In the game menu:

- Enable Multiplayer
- Set Nickname
- Set Server, for your host: `ws://89.168.107.87:8080`
- Start run

## Notes

- Sync includes players, player bullets, and host snapshots for enemies/bosses.
- Training mode can run in multiplayer sessions.
- World simulation is still host-driven (not full dedicated authoritative combat).
- Use a process manager for production, for example systemd or pm2.
