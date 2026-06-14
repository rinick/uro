import type {KataGoConsoleMessage} from '@ulugo/katago-core';

export function createLocalConsoleMessage(
  source: 'ulugo' | 'katago',
  level: 'info' | 'warning' | 'error',
  text: string
): KataGoConsoleMessage {
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    time: new Date().toISOString(),
    source,
    level,
    text,
  };
}

export function formatConsoleTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'});
}
