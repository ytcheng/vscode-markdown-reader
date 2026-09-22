import { describe, expect, it } from 'vitest';
import manifest from '../../package.json';

describe('extension scaffold', () => {
  it('declares the compiled extension entry point', () => {
    expect(manifest.main).toBe('./dist/extension.js');
  });

  it('targets the supported VS Code version', () => {
    expect(manifest.engines.vscode).toBe('^1.100.0');
  });
});
