'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const RPC = require('discord-rpc');

const DISCORD_CLIENT_ID = '1482793632263049389';

let win = null;
let rpc = null;
let rpcReady = false;
let rpcEnabled = false;
let sessionStart = Date.now();

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#07050f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.removeMenu();
  win.loadFile(path.join(__dirname, 'index.html'));
}

async function setupDiscordRPC() {
  try {
    RPC.register(DISCORD_CLIENT_ID);
    rpc = new RPC.Client({ transport: 'ipc' });

    rpc.on('ready', () => {
      rpcReady = true;
      rpcEnabled = true;
      setPresence({ details: 'In Main Menu', state: 'Choosing loadout' });
    });

    rpc.on('disconnected', () => {
      rpcReady = false;
      rpcEnabled = false;
    });

    rpc.on('error', () => {
      rpcReady = false;
      rpcEnabled = false;
    });

    await rpc.login({ clientId: DISCORD_CLIENT_ID });
  } catch {
    rpcReady = false;
    rpcEnabled = false;
  }
}

function setPresence(payload) {
  if (!rpcEnabled || !rpcReady || !rpc) return;
  const details = String(payload?.details || 'Playing Void Gambler').slice(0, 128);
  const state = String(payload?.state || '').slice(0, 128);
  const activity = {
    details,
    state,
    instance: false,
    startTimestamp: payload?.resetTimestamp ? Date.now() : sessionStart,
  };
  rpc.setActivity(activity).catch(() => {});
}

function clearPresence() {
  if (!rpcEnabled || !rpcReady || !rpc) return;
  rpc.clearActivity().catch(() => {});
}

ipcMain.on('rpc:setPresence', (_evt, payload) => {
  setPresence(payload || {});
});

ipcMain.on('rpc:clearPresence', () => {
  clearPresence();
});

app.whenReady().then(async () => {
  createWindow();
  await setupDiscordRPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    clearPresence();
    if (rpc) rpc.destroy();
  } catch {
    // no-op
  }
});
