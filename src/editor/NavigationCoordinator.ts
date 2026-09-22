export interface NavigationPanel {
  postMessage(message: { type: 'navigateToAnchor'; slug: string }): unknown;
}

export class NavigationCoordinator {
  readonly #activePanels = new Map<string, NavigationPanel>();
  readonly #pendingSlugs = new Map<string, string>();

  markActive(uri: string, panel: NavigationPanel): void {
    this.#activePanels.set(uri, panel);
  }

  remove(uri: string, panel: NavigationPanel): void {
    if (this.#activePanels.get(uri) === panel) this.#activePanels.delete(uri);
  }

  navigate(uri: string, slug: string | undefined): void {
    if (!slug) return;
    const panel = this.#activePanels.get(uri);
    if (panel) void panel.postMessage({ type: 'navigateToAnchor', slug });
    else this.#pendingSlugs.set(uri, slug);
  }

  ready(uri: string, panel: NavigationPanel): void {
    this.markActive(uri, panel);
    const slug = this.#pendingSlugs.get(uri);
    if (!slug) return;
    this.#pendingSlugs.delete(uri);
    void panel.postMessage({ type: 'navigateToAnchor', slug });
  }
}
