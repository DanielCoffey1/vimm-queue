const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('queueApp', {
  command:(name,data)=>ipcRenderer.invoke('command',name,data),
  subscribe:callback=>ipcRenderer.on('state',(_event,state)=>callback(state))
});
