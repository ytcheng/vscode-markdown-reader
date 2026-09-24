import type { ReaderLanguage } from '../settings/ReaderSettings.js';

export type ReaderUiLanguage = Exclude<ReaderLanguage, 'auto'>;

const messages = {
  en: {
    largeFileTitle: 'Large file mode: syntax highlighting, math and diagrams are shown as source. Open settings to change.',
    largeFileAriaLabel: 'Large file mode enabled. Open settings',
    readerMenu: 'Reader menu', viewSource: 'View Source', printPdf: 'Print / Save as PDF…', exportHtml: 'Export HTML…',
    readingSettings: 'Reading Settings…', feedback: 'Feedback', about: 'About', closeSettings: 'Close settings',
    settingsTitle: 'Reading Settings', language: 'Language', languageAuto: 'Auto (Follow VS Code)', languageEnglish: 'English', languageChinese: 'Chinese (Simplified)',
    readingTheme: 'Reading theme', themeReader: 'Reader', themeGithub: 'GitHub', appearance: 'Appearance', followVsCode: 'Follow VS Code',
    light: 'Light', dark: 'Dark', bodyFont: 'Body font', systemDefault: 'System default', serif: 'Serif', monospace: 'Monospace',
    custom: 'Custom', customFont: 'Custom font', customFontExample: 'e.g. Noto Sans SC, sans-serif', fontSize: 'Font size',
    customSize: 'Custom size', decreaseFontSize: 'Decrease font size', fontSizePixels: 'Font size in pixels', increaseFontSize: 'Increase font size',
    followingEditorSize: 'Following VS Code editor font size:', readerDisplaySize: 'Reader display:', contentWidth: 'Content width',
    largeFileMode: 'Large file mode', automatic: 'Automatic', enabled: 'On', disabled: 'Off',
    largeFileNote: 'Automatic at {threshold} KiB. Large file mode shows code, math and diagrams as source. Turn it off for full rendering.',
    changesSaved: 'Changes are saved automatically. Custom fonts must be installed on this computer.',
    restoreDefaults: 'Restore defaults', moreVsCodeSettings: 'More VS Code settings…', tableOfContents: 'Table of contents',
    resizeTableOfContents: 'Resize table of contents', toggleTableOfContents: 'Toggle table of contents', find: 'Find',
    previousMatch: 'Previous match', nextMatch: 'Next match', closeFind: 'Close find', editHeading: 'Edit heading in source',
    copyHeadingLink: 'Copy Heading Link', copyCode: 'Copy code', copyLanguageCode: 'Copy {language} code', codeCopied: 'Code copied',
    copyFailed: 'Copy failed', untitledSection: 'Untitled section', expandSection: 'Expand {section}', collapseSection: 'Collapse {section}',
    matchCount: '{current} of {total}', noMatches: '0 of 0', mermaidAlt: 'Mermaid diagram',
    mermaidRenderFailed: 'Unable to render Mermaid diagram. Check the source syntax.', errorPrefix: 'Markdown Reader',
  },
  'zh-CN': {
    largeFileTitle: '大文件模式：语法高亮、数学公式和图表将显示为源码。可在设置中更改。',
    largeFileAriaLabel: '大文件模式已启用。打开设置',
    readerMenu: '阅读器菜单', viewSource: '查看源码', printPdf: '打印 / 保存为 PDF…', exportHtml: '导出 HTML…',
    readingSettings: '阅读设置…', feedback: '反馈', about: '关于', closeSettings: '关闭设置',
    settingsTitle: '阅读设置', language: '语言', languageAuto: '自动（跟随 VS Code）', languageEnglish: 'English', languageChinese: '简体中文',
    readingTheme: '阅读主题', themeReader: 'Reader', themeGithub: 'GitHub', appearance: '外观', followVsCode: '跟随 VS Code',
    light: '浅色', dark: '深色', bodyFont: '正文字体', systemDefault: '系统默认', serif: '衬线字体', monospace: '等宽字体',
    custom: '自定义', customFont: '自定义字体', customFontExample: '例如：Noto Sans SC, sans-serif', fontSize: '字号',
    customSize: '自定义字号', decreaseFontSize: '减小字号', fontSizePixels: '字号（像素）', increaseFontSize: '增大字号',
    followingEditorSize: '跟随 VS Code 编辑器字号：', readerDisplaySize: '阅读器显示：', contentWidth: '正文宽度',
    largeFileMode: '大文件模式', automatic: '自动', enabled: '开启', disabled: '关闭',
    largeFileNote: '达到 {threshold} KiB 时自动启用。大文件模式会将代码、公式和图表显示为源码。关闭后恢复完整渲染。',
    changesSaved: '更改会自动保存。自定义字体需要安装在本机。',
    restoreDefaults: '恢复默认值', moreVsCodeSettings: '更多 VS Code 设置…', tableOfContents: '目录',
    resizeTableOfContents: '调整目录宽度', toggleTableOfContents: '切换目录显示', find: '查找',
    previousMatch: '上一个匹配项', nextMatch: '下一个匹配项', closeFind: '关闭查找', editHeading: '在源码中编辑标题',
    copyHeadingLink: '复制标题链接', copyCode: '复制代码', copyLanguageCode: '复制 {language} 代码', codeCopied: '已复制代码',
    copyFailed: '复制失败', untitledSection: '未命名章节', expandSection: '展开 {section}', collapseSection: '折叠 {section}',
    matchCount: '第 {current} 项，共 {total} 项', noMatches: '0 项', mermaidAlt: 'Mermaid 图表',
    mermaidRenderFailed: 'Mermaid 图表渲染失败，请检查源码语法。', errorPrefix: 'Markdown Reader',
  }
} satisfies Record<string, Record<string, string>>;

export type ReaderMessageKey = keyof typeof messages.en;

export function resolveReaderLanguage(language: ReaderLanguage, vscodeLanguage: string): ReaderUiLanguage {
  if (language === 'en' || language === 'zh-CN') return language;
  return /^zh(?:[-_]|$)/i.test(vscodeLanguage) ? 'zh-CN' : 'en';
}

export function translate(language: ReaderUiLanguage, key: ReaderMessageKey, values: Record<string, string | number> = {}): string {
  return messages[language][key].replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? ''));
}

export function localizeStaticReaderUi(document: Document, language: ReaderUiLanguage): void {
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n as ReaderMessageKey;
    element.textContent = translate(language, key);
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const key = element.dataset.i18nTitle as ReaderMessageKey;
    element.title = translate(language, key);
  }
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
    const key = element.dataset.i18nAriaLabel as ReaderMessageKey;
    element.setAttribute('aria-label', translate(language, key));
  }
  for (const element of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    const key = element.dataset.i18nPlaceholder as ReaderMessageKey;
    element.placeholder = translate(language, key);
  }
}
