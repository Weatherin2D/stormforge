const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("stormforge", {
  platform: process.platform,
  isElectron: true,
});
