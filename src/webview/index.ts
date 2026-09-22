import { ReaderApp } from './ReaderApp.js';
import type { VsCodeApi } from './ReaderApp.js';

declare function acquireVsCodeApi(): VsCodeApi;

new ReaderApp(document, acquireVsCodeApi()).start();
