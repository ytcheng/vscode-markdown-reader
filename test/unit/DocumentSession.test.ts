import { describe, expect, it, vi } from 'vitest';
import { DocumentSession } from '../../src/editor/DocumentSession.js';

describe('DocumentSession', () => {
  it('renders with a replacement text provider after a document model is reopened', async () => {
    vi.useFakeTimers();
    const render = vi.fn((source: string, revision: number) => ({ revision, html: source, headings: [], resources: [] }));
    const panel = { postRender: vi.fn(async () => true) };
    const session = new DocumentSession(() => '# old', { render }, 200);
    session.attach(panel);

    session.setTextProvider(() => '# new');
    session.schedule();
    await vi.advanceTimersByTimeAsync(200);

    expect(render).toHaveBeenCalledWith('# new', 1);
    vi.useRealTimers();
  });

  it('debounces changes and waits to send content until a newly attached panel is ready', async () => {
    vi.useFakeTimers();
    const render = vi.fn((source: string, revision: number) => ({ revision, html: source, headings: [], resources: [] }));
    const first = { postRender: vi.fn(async () => true) };
    const later = { postRender: vi.fn(async () => true) };
    const session = new DocumentSession(() => '# latest', { render }, 200);
    session.attach(first);
    session.schedule();
    session.schedule();
    await vi.advanceTimersByTimeAsync(200);

    expect(render).toHaveBeenCalledTimes(1);
    expect(first.postRender).toHaveBeenCalledWith(expect.objectContaining({ revision: 1, html: '# latest' }));
    session.attach(later);
    expect(later.postRender).not.toHaveBeenCalled();

    await session.renderNow();
    expect(later.postRender).toHaveBeenCalledWith(expect.objectContaining({ revision: 2, html: '# latest' }));
    vi.useRealTimers();
  });

  it('drops an old async render after a newer revision starts', async () => {
    let resolveFirst: ((value: { revision: number; html: string; headings: []; resources: [] }) => void) | undefined;
    const firstRender = new Promise<{ revision: number; html: string; headings: []; resources: [] }>((resolve) => { resolveFirst = resolve; });
    const render = vi.fn().mockReturnValueOnce(firstRender).mockImplementation((_source, revision) => ({ revision, html: 'new', headings: [], resources: [] }));
    const panel = { postRender: vi.fn(async () => true) };
    const session = new DocumentSession(() => 'text', { render });
    session.attach(panel);
    const first = session.renderNow();
    await session.renderNow();
    resolveFirst!({ revision: 1, html: 'old', headings: [], resources: [] });
    await first;

    expect(panel.postRender).toHaveBeenCalledTimes(1);
    expect(panel.postRender).toHaveBeenCalledWith(expect.objectContaining({ revision: 2, html: 'new' }));
  });
});
