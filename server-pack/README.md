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

## Connect from client

In the game menu:

- Enable Multiplayer
- Set Nickname
- Set Server, for your host: `ws://89.168.107.87:8080`
- Start run

## Notes

- This is a realtime player-sync baseline (positions + nick + hp + level).
- It does not yet make enemies/loot authoritative.
- Use a process manager for production, for example systemd or pm2.
