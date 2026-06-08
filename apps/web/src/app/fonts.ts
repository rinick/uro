import type {antdLocales} from './appUiUtils';

type AppLanguage = keyof typeof antdLocales;

const fallbackFonts = ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'];

const cjkFontsByLanguage: Partial<Record<AppLanguage, string[]>> = {
  ja: [
    'Noto Sans JP',
    'Noto Sans CJK JP',
    'Hiragino Sans',
    'Hiragino Kaku Gothic ProN',
    'Yu Gothic',
    'Meiryo',
    'Noto Sans SC',
    'Noto Sans CJK SC',
    'Noto Sans KR',
    'Noto Sans CJK KR',
  ],
  ko: [
    'Noto Sans KR',
    'Noto Sans CJK KR',
    'Apple SD Gothic Neo',
    'Malgun Gothic',
    'Nanum Gothic',
    'Noto Sans SC',
    'Noto Sans CJK SC',
    'Noto Sans JP',
    'Noto Sans CJK JP',
  ],
  zh: [
    'Noto Sans SC',
    'Noto Sans CJK SC',
    'PingFang SC',
    'Hiragino Sans GB',
    'Microsoft YaHei',
    'WenQuanYi Micro Hei',
    'Noto Sans JP',
    'Noto Sans CJK JP',
    'Noto Sans KR',
    'Noto Sans CJK KR',
  ],
};

function quoteFontFamily(fontFamily: string): string {
  return fontFamily.includes(' ') ? `'${fontFamily}'` : fontFamily;
}

export function getAppFontFamily(language: AppLanguage): string {
  const cjkFonts = cjkFontsByLanguage[language] ?? [
    'Noto Sans SC',
    'Noto Sans CJK SC',
    'PingFang SC',
    'Microsoft YaHei',
    'Noto Sans JP',
    'Noto Sans CJK JP',
    'Hiragino Sans',
    'Yu Gothic',
    'Noto Sans KR',
    'Noto Sans CJK KR',
    'Apple SD Gothic Neo',
    'Malgun Gothic',
  ];
  return ['Noto Sans', 'Uro Noto Sans', ...cjkFonts, ...fallbackFonts].map(quoteFontFamily).join(', ');
}
