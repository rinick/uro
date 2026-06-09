import deDE from 'antd/locale/de_DE';
import enUS from 'antd/locale/en_US';
import frFR from 'antd/locale/fr_FR';
import jaJP from 'antd/locale/ja_JP';
import koKR from 'antd/locale/ko_KR';
import ruRU from 'antd/locale/ru_RU';
import zhCN from 'antd/locale/zh_CN';
import type {KataGoConsoleMessage} from '@ulugo/katago-core';

export const languageOptions = [
  {value: 'en', label: 'English'},
  {value: 'zh', label: '中文'},
  {value: 'ja', label: '日本語'},
  {value: 'ko', label: '한국어'},
  {value: 'fr', label: 'Français'},
  {value: 'de', label: 'Deutsch'},
  {value: 'ru', label: 'Русский'},
];

export const antdLocales = {
  de: deDE,
  en: enUS,
  fr: frFR,
  ja: jaJP,
  ko: koKR,
  ru: ruRU,
  zh: zhCN,
} as const;

export type AppLanguage = keyof typeof antdLocales;

const languageStorageKey = 'ulugo.language';

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

export function normalizeLanguage(language: string): AppLanguage {
  return matchLanguage(language) ?? 'en';
}

export function resolveInitialLanguage(): AppLanguage {
  const storedLanguage = readStoredLanguage();
  if (storedLanguage != null) return storedLanguage;

  const browserLanguages = typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language];
  for (const language of browserLanguages) {
    const match = matchLanguage(language);
    if (match != null) return match;
  }

  return 'en';
}

export function saveLanguage(language: AppLanguage): void {
  try {
    localStorage.setItem(languageStorageKey, language);
  } catch {
    // Ignore storage failures; language still changes for this session.
  }
}

function readStoredLanguage(): AppLanguage | null {
  try {
    const language = localStorage.getItem(languageStorageKey);
    return language == null ? null : matchLanguage(language);
  } catch {
    return null;
  }
}

function matchLanguage(language: string): AppLanguage | null {
  const baseLanguage = language.split('-')[0];
  return baseLanguage in antdLocales ? (baseLanguage as AppLanguage) : null;
}
