'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronRPC', {
  setPresence(payload) {
    ipcRenderer.send('rpc:setPresence', payload || {});
  },
  clearPresence() {
    ipcRenderer.send('rpc:clearPresence');
  },
});
