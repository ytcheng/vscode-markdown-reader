import { expect, it } from 'vitest';
import { defaultSettings, normalizeSettings, isSettingValue, useLargeFileMode } from '../../src/settings/ReaderSettings.js';

it('normalizes invalid persisted settings without CSS injection', () => {
  expect(normalizeSettings({ theme: 'unknown', fontSize: 999, fontFamily: 'a; background:url(x)' })).toEqual(defaultSettings);
  expect(normalizeSettings({ theme: 'github', fontSize: 20, fontFamily: '"Noto Sans SC", sans-serif' })).toMatchObject({ theme: 'github', fontSize: 20, fontFamily: '"Noto Sans SC", sans-serif' });
});
it('validates only known settings and finite bounded values', () => {
  expect(isSettingValue('fontSize', 12)).toBe(true);
  expect(isSettingValue('fontSize', 32)).toBe(true);
  for (const n of [11, 33, 16.5, NaN]) expect(isSettingValue('fontSize', n)).toBe(false);
  expect(isSettingValue('__proto__', {})).toBe(false);
  expect(isSettingValue('fontFamily', '</style><script>')).toBe(false);
});
it('uses UTF-8 bytes and obeys explicit large file mode overrides', () => {
  const text = '中'.repeat(400);
  expect(useLargeFileMode(text, { ...defaultSettings, largeFileThresholdKb: 1 })).toBe(true);
  expect(useLargeFileMode('short', { ...defaultSettings, largeFileMode: 'on' })).toBe(true);
  expect(useLargeFileMode(text, { ...defaultSettings, largeFileMode: 'off', largeFileThresholdKb: 1 })).toBe(false);
});
