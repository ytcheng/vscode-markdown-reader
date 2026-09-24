export interface ReaderSettings {
  language: ReaderLanguage;
  theme: 'reader' | 'github';
  colorMode: 'auto' | 'light' | 'dark';
  fontFamily: string;
  fontSize: number;
  fontSizeMode: 'editor' | 'custom';
  /** Resolved from editor.fontSize at runtime; never stored in markdownReader settings. */
  editorFontSize?: number;
  contentMaxWidth: number;
  largeFileMode: 'auto' | 'on' | 'off';
  largeFileThresholdKb: number;
}
export type ReaderLanguage = 'auto' | 'en' | 'zh-CN';
export type ReaderSettingKey = Exclude<keyof ReaderSettings, 'editorFontSize'>;
export const defaultSettings: Readonly<ReaderSettings> = Object.freeze({
  language: 'auto', theme: 'reader', colorMode: 'light', fontFamily: '', fontSize: 16, fontSizeMode: 'editor',
  contentMaxWidth: 900, largeFileMode: 'auto', largeFileThresholdKb: 1024
});
export const settingKeys = Object.keys(defaultSettings) as ReaderSettingKey[];
export const configurationKeys: Record<ReaderSettingKey, string> = {
  language: 'language', theme: 'theme', colorMode: 'colorMode', fontFamily: 'fontFamily', fontSize: 'fontSize', fontSizeMode: 'fontSizeMode',
  contentMaxWidth: 'content.maxWidth', largeFileMode: 'largeFile.mode', largeFileThresholdKb: 'largeFile.thresholdKb'
};
export function isSettingValue(key: string, value: unknown): boolean {
  switch (key) {
    case 'language': return value === 'auto' || value === 'en' || value === 'zh-CN';
    case 'theme': return value === 'reader' || value === 'github';
    case 'colorMode': return ['auto', 'light', 'dark'].includes(String(value)) && typeof value === 'string';
    case 'largeFileMode': return ['auto', 'on', 'off'].includes(String(value)) && typeof value === 'string';
    case 'fontFamily': return typeof value === 'string' && value.length <= 200 && !/[;{}<>\\\n\r\x00-\x1f]/u.test(value) && !/url\s*\(/i.test(value);
    case 'fontSize': return integerBetween(value, 12, 32);
    case 'fontSizeMode': return value === 'editor' || value === 'custom';
    case 'contentMaxWidth': return integerBetween(value, 560, 1600);
    case 'largeFileThresholdKb': return integerBetween(value, 1, 102400);
    default: return false;
  }
}
function integerBetween(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
export function normalizeSettings(value: Partial<Record<keyof ReaderSettings, unknown>>): ReaderSettings {
  const result = { ...defaultSettings };
  for (const key of settingKeys) if (isSettingValue(key, value[key])) Object.assign(result, { [key]: value[key] });
  if (isEditorFontSize(value.editorFontSize)) result.editorFontSize = value.editorFontSize;
  return result;
}
export function isEditorFontSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 6 && value <= 100;
}
export function effectiveFontSize(settings: ReaderSettings): number {
  // The reader uses a proportional UI font while the editor uses a monospaced font;
  // a 1px optical adjustment makes equal nominal sizes appear closer in height.
  return settings.fontSizeMode === 'editor' ? (settings.editorFontSize ?? 14) + 1 : settings.fontSize;
}
export function useLargeFileMode(source: string, settings: ReaderSettings): boolean {
  return settings.largeFileMode === 'on' || (settings.largeFileMode === 'auto' && new TextEncoder().encode(source).length >= settings.largeFileThresholdKb * 1024);
}
