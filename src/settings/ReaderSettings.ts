export interface ReaderSettings {
  theme: 'reader' | 'github';
  colorMode: 'auto' | 'light' | 'dark';
  fontFamily: string;
  fontSize: number;
  contentMaxWidth: number;
  largeFileMode: 'auto' | 'on' | 'off';
  largeFileThresholdKb: number;
}
export const defaultSettings: Readonly<ReaderSettings> = Object.freeze({
  theme: 'reader', colorMode: 'light', fontFamily: '', fontSize: 16,
  contentMaxWidth: 900, largeFileMode: 'auto', largeFileThresholdKb: 1024
});
export const settingKeys = Object.keys(defaultSettings) as (keyof ReaderSettings)[];
export const configurationKeys: Record<keyof ReaderSettings, string> = {
  theme: 'theme', colorMode: 'colorMode', fontFamily: 'fontFamily', fontSize: 'fontSize',
  contentMaxWidth: 'content.maxWidth', largeFileMode: 'largeFile.mode', largeFileThresholdKb: 'largeFile.thresholdKb'
};
export function isSettingValue(key: string, value: unknown): boolean {
  switch (key) {
    case 'theme': return value === 'reader' || value === 'github';
    case 'colorMode': return ['auto', 'light', 'dark'].includes(String(value)) && typeof value === 'string';
    case 'largeFileMode': return ['auto', 'on', 'off'].includes(String(value)) && typeof value === 'string';
    case 'fontFamily': return typeof value === 'string' && value.length <= 200 && !/[;{}<>\\\n\r\x00-\x1f]/u.test(value) && !/url\s*\(/i.test(value);
    case 'fontSize': return integerBetween(value, 12, 32);
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
  return result;
}
export function useLargeFileMode(source: string, settings: ReaderSettings): boolean {
  return settings.largeFileMode === 'on' || (settings.largeFileMode === 'auto' && new TextEncoder().encode(source).length >= settings.largeFileThresholdKb * 1024);
}
