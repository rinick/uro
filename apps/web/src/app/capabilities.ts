export interface AppCapabilities {
  platform: 'web' | 'electron';
  storage: 'browser' | 'filesystem';
  katago: boolean;
}

export const webCapabilities: AppCapabilities = {
  platform: 'web',
  storage: 'browser',
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
