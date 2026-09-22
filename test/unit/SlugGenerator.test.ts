import { describe, expect, it } from 'vitest';
import { SlugGenerator } from '../../src/renderer/SlugGenerator.js';

describe('SlugGenerator', () => {
  it('normalizes mixed-language text and appends suffixes for duplicates', () => {
    const slugs = new SlugGenerator();

    expect(slugs.slug(' 架构 API ')).toBe('架构-api');
    expect(slugs.slug('架构 API')).toBe('架构-api-1');
  });

  it('uses section for headings containing only punctuation or emoji', () => {
    const slugs = new SlugGenerator();

    expect(slugs.slug('🎉 !!!')).toBe('section');
    expect(slugs.slug('🎉 !!!')).toBe('section-1');
  });
});
