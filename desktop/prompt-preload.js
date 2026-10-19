const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("promptApi", {
  answer: (value) => ipcRenderer.send("prompt:answer", value),
});
