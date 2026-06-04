import {contextBridge, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('uro', {
  platform: 'electron',
  importSgf: () => ipcRenderer.invoke('uro:import-sgf'),
  exportSgf: (request: {content: string; suggestedName: string}) => ipcRenderer.invoke('uro:export-sgf', request),
  selectFile: (options?: {title?: string; filters?: Array<{name: string; extensions: string[]}>}) =>
    ipcRenderer.invoke('uro:select-file', options),
  katago: {
    getSettings: () => ipcRenderer.invoke('uro:katago:get-settings'),
    saveSettings: (settings: unknown) => ipcRenderer.invoke('uro:katago:save-settings', settings),
    getDownloadOptions: () => ipcRenderer.invoke('uro:katago:get-download-options'),
    download: (request: {kind: 'katago' | 'model'; optionId: string}) =>
      ipcRenderer.invoke('uro:katago:download', request),
    onDownloadProgress: (callback: (progress: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress);
      ipcRenderer.on('uro:katago:download-progress', listener);
      return () => ipcRenderer.off('uro:katago:download-progress', listener);
    },
    analyze: (query: unknown) => ipcRenderer.invoke('uro:katago:analyze', query),
    stopAnalysis: () => ipcRenderer.invoke('uro:katago:stop-analysis'),
    onAnalysis: (callback: (result: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, result: unknown) => callback(result);
      ipcRenderer.on('uro:katago:analysis', listener);
      return () => ipcRenderer.off('uro:katago:analysis', listener);
    },
    onAnalysisError: (callback: (message: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
      ipcRenderer.on('uro:katago:analysis-error', listener);
      return () => ipcRenderer.off('uro:katago:analysis-error', listener);
    },
    onConsoleMessage: (callback: (message: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, message: unknown) => callback(message);
      ipcRenderer.on('uro:katago:console', listener);
      return () => ipcRenderer.off('uro:katago:console', listener);
    },
  },
  analysis: {
    getSettings: () => ipcRenderer.invoke('uro:analysis:get-settings'),
    saveSettings: (settings: unknown) => ipcRenderer.invoke('uro:analysis:save-settings', settings),
  },
});
