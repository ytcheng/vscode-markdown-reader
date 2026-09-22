import { expect, it, vi } from 'vitest';
import { TocStateStore } from '../../src/editor/TocStateStore.js';

it('persists TOC by URI across instances without sharing mutable state', async () => {
  const values = new Map<string, unknown>();
  const storage = { get: <T>(key: string) => values.get(key) as T | undefined, update: vi.fn(async (key: string, value: unknown) => { values.set(key, value); }) };
  const first = new TocStateStore(storage);
  await first.set('file:///a.md', { tocVisible: false, collapsedSlugs: ['intro'] });
  await first.set('file:///b.md', { tocVisible: true, collapsedSlugs: [] });
  const reopened = new TocStateStore(storage);
  expect(reopened.get('file:///a.md')).toEqual({ tocVisible: false, collapsedSlugs: ['intro'] });
  reopened.get('file:///a.md')!.collapsedSlugs.push('mutated');
  expect(reopened.get('file:///a.md')!.collapsedSlugs).toEqual(['intro']);
  expect(reopened.get('file:///b.md')!.tocVisible).toBe(true);
});

it('bounds the cache and ignores corrupt persisted values', async () => {
  const store = new TocStateStore({ get: () => [['broken', { tocVisible: 'yes' }]] as never, update: async () => undefined });
  expect(store.get('broken')).toBeUndefined();
  for (let i = 0; i < 101; i++) await store.set(String(i), { tocVisible: true, collapsedSlugs: [] });
  expect(store.get('0')).toBeUndefined();
  expect(store.get('100')).toBeDefined();
});
