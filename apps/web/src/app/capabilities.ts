export interface AppCapabilities {
  platform: 'web' | 'electron';
  storage: 'indexeddb' | 'filesystem';
  katago: boolean;
}

export const webCapabilities: AppCapabilities = {
  platform: 'web',
  storage: 'indexeddb',
  katago: false,
};

export const electronCapabilities: AppCapabilities = {
  platform: 'electron',
  storage: 'filesystem',
  katago: true,
};

export function getAppCapabilities(): AppCapabilities {
  return window.ulugo?.platform === 'electron' ? electronCapabilities : webCapabilities;
}
