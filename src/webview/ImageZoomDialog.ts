import { translate, type ReaderUiLanguage } from './localization.js';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type ZoomIcon = 'zoomIn' | 'zoomOut' | 'fit' | 'close';
type ZoomLabel = 'zoomIn' | 'zoomOut' | 'zoomFit' | 'zoomClose';
interface PointerDrag {
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
}

function createZoomIcon(document: Document, icon: ZoomIcon): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  if (icon === 'zoomIn' || icon === 'zoomOut') {
    const lens = document.createElementNS(SVG_NAMESPACE, 'circle');
    lens.setAttribute('cx', '10.5');
    lens.setAttribute('cy', '10.5');
    lens.setAttribute('r', '6.5');
    svg.append(lens);
    const detail = document.createElementNS(SVG_NAMESPACE, 'path');
    detail.setAttribute('d', icon === 'zoomIn' ? 'M8 10.5h5m-2.5-2.5v5m4.8 2.3L21 21' : 'M8 10.5h5m2.3 4.8L21 21');
    svg.append(detail);
    return svg;
  }

  const shape = document.createElementNS(SVG_NAMESPACE, 'path');
  shape.setAttribute('d', icon === 'fit'
    ? 'M4 9V5a1 1 0 0 1 1-1h4m6 0h4a1 1 0 0 1 1 1v4m0 6v4a1 1 0 0 1-1 1h-4m-6 0H5a1 1 0 0 1-1-1v-4M9 9h6v6H9z'
    : 'M5 5l14 14M19 5 5 19');
  svg.append(shape);
  return svg;
}

export class ImageZoomDialog {
  readonly #dialog: HTMLDialogElement;
  readonly #image: HTMLImageElement;
  readonly #viewport: HTMLDivElement;
  readonly #controls: HTMLDivElement;
  readonly #zoomOutButton: HTMLButtonElement;
  readonly #zoomInButton: HTMLButtonElement;
  readonly #fitButton: HTMLButtonElement;
  readonly #closeButton: HTMLButtonElement;
  readonly #zoomLevel: HTMLOutputElement;
  #trigger: HTMLImageElement | undefined;
  #language: ReaderUiLanguage;
  #zoom = 1;
  #fitWidth = 0;
  #fitHeight = 0;
  #pointerDrag: PointerDrag | undefined;
  #restoreFocus = true;
  #disposed = false;

  constructor(private readonly document: Document) {
    this.#language = document.body.dataset.readerLanguage === 'zh-CN' ? 'zh-CN' : 'en';

    this.#dialog = document.createElement('dialog');
    this.#dialog.className = 'image-zoom-dialog';
    this.#dialog.setAttribute('aria-label', translate(this.#language, 'zoomViewerTitle'));
    const panel = document.createElement('div');
    panel.className = 'image-zoom-panel';

    this.#viewport = document.createElement('div');
    this.#viewport.className = 'image-zoom-viewport';
    this.#image = document.createElement('img');
    this.#image.className = 'image-zoom-image';
    this.#image.draggable = false;
    this.#image.addEventListener('pointerdown', this.#onPointerDown);
    this.#image.addEventListener('pointermove', this.#onPointerMove);
    this.#image.addEventListener('pointerup', this.#onPointerEnd);
    this.#image.addEventListener('pointercancel', this.#onPointerEnd);
    this.#image.addEventListener('lostpointercapture', this.#onPointerEnd);
    this.#viewport.append(this.#image);

    const toolbar = document.createElement('div');
    toolbar.className = 'image-zoom-toolbar';
    this.#closeButton = this.#createButton('close', 'zoomClose', () => this.close());
    toolbar.append(this.#closeButton);

    this.#controls = document.createElement('div');
    this.#controls.className = 'image-zoom-controls';
    this.#zoomOutButton = this.#createButton('zoomOut', 'zoomOut', () => this.#setZoom(this.#zoom / ZOOM_STEP));
    this.#zoomLevel = document.createElement('output');
    this.#zoomLevel.className = 'image-zoom-level';
    this.#zoomLevel.setAttribute('role', 'status');
    this.#zoomLevel.setAttribute('aria-live', 'polite');
    this.#fitButton = this.#createButton('fit', 'zoomFit', () => this.#fit());
    this.#zoomInButton = this.#createButton('zoomIn', 'zoomIn', () => this.#setZoom(this.#zoom * ZOOM_STEP));
    this.#controls.append(this.#zoomOutButton, this.#zoomLevel, this.#zoomInButton, this.#fitButton);

    panel.append(this.#viewport, toolbar, this.#controls);
    this.#dialog.append(panel);
    this.#dialog.addEventListener('cancel', this.#onCancel);
    this.#dialog.addEventListener('click', this.#onDialogClick);
    this.#dialog.addEventListener('close', this.#onClose);
    this.document.defaultView?.addEventListener('resize', this.#onResize);
    document.body.append(this.#dialog);
    this.setLanguage(this.#language);
  }

  open(trigger: HTMLImageElement): void {
    if (this.#disposed) return;
    this.#trigger = trigger;
    this.#restoreFocus = true;
    this.#zoom = 1;
    this.#image.src = trigger.currentSrc || trigger.src;
    this.#image.alt = trigger.alt;
    this.#dialog.showModal();
    this.#closeButton.focus();
    this.#fitWhenReady();
  }

  close(restoreFocus = true): void {
    if (!this.#dialog.open) return;
    this.#restoreFocus = restoreFocus;
    this.#dialog.close();
  }

  setLanguage(language: ReaderUiLanguage): void {
    this.#language = language;
    this.#image.lang = language;
    this.#dialog.setAttribute('aria-label', translate(language, 'zoomViewerTitle'));
    this.#zoomOutButton.setAttribute('aria-label', translate(language, 'zoomOut'));
    this.#zoomOutButton.title = translate(language, 'zoomOut');
    this.#zoomInButton.setAttribute('aria-label', translate(language, 'zoomIn'));
    this.#zoomInButton.title = translate(language, 'zoomIn');
    this.#fitButton.setAttribute('aria-label', translate(language, 'zoomFit'));
    this.#fitButton.title = translate(language, 'zoomFit');
    this.#closeButton.setAttribute('aria-label', translate(language, 'zoomClose'));
    this.#closeButton.title = translate(language, 'zoomClose');
    this.#updateZoomControls();
  }

  dispose(): void {
    this.#disposed = true;
    this.document.defaultView?.removeEventListener('resize', this.#onResize);
    this.close(false);
    this.#dialog.remove();
  }

  #createButton(icon: ZoomIcon, label: ZoomLabel, onClick: () => void): HTMLButtonElement {
    const button = this.document.createElement('button');
    button.type = 'button';
    button.className = 'image-zoom-button';
    button.classList.add(`image-zoom-${icon}`);
    button.append(createZoomIcon(this.document, icon));
    button.setAttribute('aria-label', translate(this.#language, label));
    button.addEventListener('click', onClick);
    return button;
  }

  #fitWhenReady(): void {
    if (this.#image.complete && this.#image.naturalWidth > 0) {
      this.#fit();
      return;
    }
    this.#image.addEventListener('load', this.#onImageLoad, { once: true });
  }

  #fit(): void {
    if (!this.#dialog.open) return;
    const naturalWidth = this.#image.naturalWidth || this.#trigger?.width || 0;
    const naturalHeight = this.#image.naturalHeight || this.#trigger?.height || 0;
    const viewportStyle = this.document.defaultView?.getComputedStyle(this.#viewport);
    const horizontalPadding = Number.parseFloat(viewportStyle?.paddingLeft ?? '0') + Number.parseFloat(viewportStyle?.paddingRight ?? '0');
    const verticalPadding = Number.parseFloat(viewportStyle?.paddingTop ?? '0') + Number.parseFloat(viewportStyle?.paddingBottom ?? '0');
    const availableWidth = Math.max(1, this.#viewport.clientWidth - horizontalPadding);
    const availableHeight = Math.max(1, this.#viewport.clientHeight - verticalPadding);
    if (naturalWidth <= 0 || naturalHeight <= 0) return;

    const scale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight);
    this.#fitWidth = naturalWidth * scale;
    this.#fitHeight = naturalHeight * scale;
    this.#zoom = 1;
    this.#applyImageSize();
  }

  #setZoom(zoom: number): void {
    this.#zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
    this.#applyImageSize();
  }

  #applyImageSize(): void {
    this.#image.style.width = `${this.#fitWidth * this.#zoom}px`;
    this.#image.style.height = `${this.#fitHeight * this.#zoom}px`;
    this.#updatePanAvailability();
    this.#updateZoomControls();
  }

  #updatePanAvailability(): void {
    const canPan = this.#viewport.scrollWidth > this.#viewport.clientWidth + 1
      || this.#viewport.scrollHeight > this.#viewport.clientHeight + 1;
    this.#viewport.dataset.canPan = String(canPan);
    if (!canPan) delete this.#viewport.dataset.panning;
  }

  #updateZoomControls(): void {
    if (!this.#zoomLevel) return;
    this.#zoomLevel.value = `${Math.round(this.#zoom * 100)}%`;
    this.#zoomLevel.textContent = this.#zoomLevel.value;
    this.#zoomOutButton.disabled = this.#zoom <= MIN_ZOOM;
    this.#zoomInButton.disabled = this.#zoom >= MAX_ZOOM;
  }

  #onImageLoad = (): void => this.#fit();
  #onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (this.#viewport.dataset.canPan !== 'true') return;
    this.#pointerDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: this.#viewport.scrollLeft,
      startScrollTop: this.#viewport.scrollTop
    };
    this.#viewport.dataset.panning = 'true';
    this.#image.setPointerCapture(event.pointerId);
  };
  #onPointerMove = (event: PointerEvent): void => {
    const drag = this.#pointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    this.#viewport.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startX);
    this.#viewport.scrollTop = drag.startScrollTop - (event.clientY - drag.startY);
  };
  #onPointerEnd = (event: PointerEvent): void => {
    if (this.#pointerDrag?.pointerId !== event.pointerId) return;
    this.#pointerDrag = undefined;
    delete this.#viewport.dataset.panning;
    if (this.#image.hasPointerCapture(event.pointerId)) this.#image.releasePointerCapture(event.pointerId);
  };
  #onResize = (): void => {
    if (!this.#dialog.open || this.#fitWidth <= 0 || this.#fitHeight <= 0) return;
    const zoom = this.#zoom;
    this.#fit();
    this.#setZoom(zoom);
  };
  #onCancel = (event: Event): void => {
    event.preventDefault();
    this.close();
  };
  #onDialogClick = (event: MouseEvent): void => {
    if (event.target !== this.#dialog) return;
    const rect = this.#dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.close();
  };
  #onClose = (): void => {
    if (this.#pointerDrag) {
      const pointerId = this.#pointerDrag.pointerId;
      this.#pointerDrag = undefined;
      delete this.#viewport.dataset.panning;
      if (this.#image.hasPointerCapture(pointerId)) this.#image.releasePointerCapture(pointerId);
    }
    const trigger = this.#trigger;
    this.#trigger = undefined;
    if (this.#disposed || !this.#restoreFocus) return;
    const target = trigger?.isConnected ? trigger : this.document.getElementById('document');
    target?.focus();
  };
}
