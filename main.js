'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const RPC = require('discord-rpc');

const DISCORD_CLIENT_ID = '1482793632263049389';
const DEBUG_ELECTRON = process.env.VG_DEBUG === '1';
const FORCE_SOFTWARE_RENDER = process.env.VG_SOFTWARE_RENDER === '1';

if (FORCE_SOFTWARE_RENDER) {
  // Fallback mode for systems with broken GPU drivers.
  app.disableHardwareAcceleration();
} else {
  // Keep hardware acceleration for smooth gameplay.
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}

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
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  if (DEBUG_ELECTRON) {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[did-fail-load] ${errorCode} ${errorDescription} ${validatedURL}`);
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      console.error('[render-process-gone]', details);
    });
  }
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
