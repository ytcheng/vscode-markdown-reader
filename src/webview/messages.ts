import type { RenderResult } from '../renderer/types.js';

export interface ViewportState {
  activeSlug?: string;
  activeHeadingOffset?: number;
  scrollTop: number;
  tocVisible: boolean;
  collapsedSlugs: string[];
}

export type ExtensionToWebviewMessage =
  | { type: 'render'; result: RenderResult; restore?: ViewportState }
  | { type: 'setTocVisible'; visible: boolean }
  | { type: 'setLayout'; tocMaxDepth: number; tocWidth: number; contentMaxWidth: number }
  | { type: 'navigateToAnchor'; slug: string }
  | { type: 'setColorMode'; mode: 'light' | 'dark' | 'high-contrast' };

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'openSource'; line?: number }
  | { type: 'openLink'; href: string }
  | { type: 'toggleToc' }
  | { type: 'setTocWidth'; width: number }
  | { type: 'viewportChanged'; state: ViewportState };
