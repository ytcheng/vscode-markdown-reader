import { describe, expect, it, vi } from 'vitest';
import { NavigationCoordinator } from '../../src/editor/NavigationCoordinator.js';

describe('NavigationCoordinator', () => {
  it('routes an anchor to the active resolved panel', () => {
    const panel = { postMessage: vi.fn() };
    const coordinator = new NavigationCoordinator();
    coordinator.markActive('file:///guide.md', panel);
    coordinator.navigate('file:///guide.md', 'install');
    expect(panel.postMessage).toHaveBeenCalledWith({ type: 'navigateToAnchor', slug: 'install' });
  });

  it('queues an anchor until a panel becomes ready and consumes it once', () => {
    const panel = { postMessage: vi.fn() };
    const coordinator = new NavigationCoordinator();
    coordinator.navigate('file:///guide.md', 'install');
    coordinator.markActive('file:///guide.md', panel);
    coordinator.ready('file:///guide.md', panel);
    coordinator.ready('file:///guide.md', panel);
    expect(panel.postMessage).toHaveBeenCalledTimes(1);
  });
});
