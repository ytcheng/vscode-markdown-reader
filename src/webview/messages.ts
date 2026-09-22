import type { ReaderSettings } from '../settings/ReaderSettings.js';
import type { RenderResult } from '../renderer/types.js';

export interface ViewportState {
  activeSlug?: string;
  activeHeadingOffset?: number;
  scrollTop: number;
  tocVisible: boolean;
  collapsedSlugs: string[];
}

export type ExtensionToWebviewMessage =
  | { type: 'setReaderSettings'; settings: ReaderSettings }
  | { type: 'settingsAcknowledged'; requestId: number; settings: ReaderSettings }
  | { type: 'showSettings' }
  | { type: 'requestExport'; action: 'print' | 'exportHtml' }
  | { type: 'render'; result: RenderResult; restore?: ViewportState }
  | { type: 'setTocVisible'; visible: boolean }
  | { type: 'setLayout'; tocMaxDepth: number; tocWidth: number; contentMaxWidth: number }
  | { type: 'navigateToAnchor'; slug: string }
  | { type: 'setColorMode'; mode: 'light' | 'dark' | 'high-contrast' };

export type WebviewToExtensionMessage =
  | { type: 'updateSetting'; key: keyof ReaderSettings; value: string | number; requestId: number }
  | { type: 'resetSettings'; requestId: number }
  | { type: 'openSettings' }
  | { type: 'exportHtml' | 'print'; diagrams: string[]; revision: number }
  | { type: 'ready' }
  | { type: 'openSource'; line?: number }
  | { type: 'openLink'; href: string }
  | { type: 'toggleToc' }
  | { type: 'setTocWidth'; width: number }
  | { type: 'viewportChanged'; state: ViewportState };
