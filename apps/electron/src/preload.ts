import {contextBridge, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('ulugo', {
  platform: 'electron',
  importSgf: () => ipcRenderer.invoke('ulugo:import-sgf'),
  exportSgf: (request: {content: string; suggestedName: string; filePath?: string}) =>
    ipcRenderer.invoke('ulugo:export-sgf', request),
  selectFile: (options?: {title?: string; filters?: Array<{name: string; extensions: string[]}>}) =>
    ipcRenderer.invoke('ulugo:select-file', options),
  googleDrive: {
    openSgf: () => ipcRenderer.invoke('ulugo:google-drive:open-sgf'),
    saveSgf: (request: {content: string; fileName: string; fileId?: string | null}) =>
      ipcRenderer.invoke('ulugo:google-drive:save-sgf', request),
  },
  katago: {
    getSettings: () => ipcRenderer.invoke('ulugo:katago:get-settings'),
    saveSettings: (settings: unknown) => ipcRenderer.invoke('ulugo:katago:save-settings', settings),
    getDownloadOptions: () => ipcRenderer.invoke('ulugo:katago:get-download-options'),
    download: (request: {kind: 'katago' | 'model'; optionId: string}) =>
      ipcRenderer.invoke('ulugo:katago:download', request),
    onDownloadProgress: (callback: (progress: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress);
      ipcRenderer.on('ulugo:katago:download-progress', listener);
      return () => ipcRenderer.off('ulugo:katago:download-progress', listener);
    },
    analyze: (query: unknown) => ipcRenderer.invoke('ulugo:katago:analyze', query),
    stopAnalysis: (queryIds?: string[]) => ipcRenderer.invoke('ulugo:katago:stop-analysis', queryIds),
    onAnalysis: (callback: (result: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, result: unknown) => callback(result);
      ipcRenderer.on('ulugo:katago:analysis', listener);
      return () => ipcRenderer.off('ulugo:katago:analysis', listener);
    },
    onAnalysisError: (callback: (message: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
      ipcRenderer.on('ulugo:katago:analysis-error', listener);
      return () => ipcRenderer.off('ulugo:katago:analysis-error', listener);
    },
    onConsoleMessage: (callback: (message: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, message: unknown) => callback(message);
      ipcRenderer.on('ulugo:katago:console', listener);
      return () => ipcRenderer.off('ulugo:katago:console', listener);
    },
  },
  analysis: {
    getSettings: () => ipcRenderer.invoke('ulugo:analysis:get-settings'),
    saveSettings: (settings: unknown) => ipcRenderer.invoke('ulugo:analysis:save-settings', settings),
  },
});
