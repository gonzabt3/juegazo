import { FIGHTER_SPRITE_CONFIG } from '../animation/fighterSpriteManifest';
import type { SpriteSheetConfig } from '../animation/types';

type EditableConfig = Pick<
  SpriteSheetConfig,
  | 'sourceOriginX'
  | 'sourceOriginY'
  | 'sourceFrameWidth'
  | 'sourceFrameHeight'
  | 'sourceStrideX'
  | 'sourceStrideY'
  | 'renderWidth'
  | 'renderHeight'
  | 'anchor'
>;

const INPUT_MAP: Record<string, keyof EditableConfig | 'anchorX' | 'anchorY'> = {
  sourceOriginX: 'sourceOriginX',
  sourceOriginY: 'sourceOriginY',
  sourceFrameWidth: 'sourceFrameWidth',
  sourceFrameHeight: 'sourceFrameHeight',
  sourceStrideX: 'sourceStrideX',
  sourceStrideY: 'sourceStrideY',
  renderWidth: 'renderWidth',
  renderHeight: 'renderHeight',
  anchorX: 'anchorX',
  anchorY: 'anchorY',
};

type Band = {
  start: number;
  end: number;
  score: number;
};

function cloneEditableConfig(config: SpriteSheetConfig): EditableConfig {
  return {
    sourceOriginX: config.sourceOriginX,
    sourceOriginY: config.sourceOriginY,
    sourceFrameWidth: config.sourceFrameWidth,
    sourceFrameHeight: config.sourceFrameHeight,
    sourceStrideX: config.sourceStrideX,
    sourceStrideY: config.sourceStrideY,
    renderWidth: config.renderWidth,
    renderHeight: config.renderHeight,
    anchor: {
      x: config.anchor.x,
      y: config.anchor.y,
    },
  };
}

function toPositiveInt(value: number): number {
  return Math.max(1, Math.round(value));
}

function toInt(value: number): number {
  return Math.round(value);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function smooth(values: number[], radius: number): number[] {
  if (radius <= 0) return [...values];
  const out = new Array(values.length).fill(0);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - radius);
    const end = Math.min(values.length - 1, i + radius);
    for (let j = start; j <= end; j++) {
      sum += values[j];
      count += 1;
    }
    out[i] = count > 0 ? sum / count : 0;
  }
  return out;
}

function detectBands(values: number[], threshold: number): Band[] {
  const bands: Band[] = [];
  let start = -1;
  let score = 0;

  for (let i = 0; i < values.length; i++) {
    if (values[i] >= threshold) {
      if (start === -1) {
        start = i;
        score = 0;
      }
      score += values[i];
      continue;
    }

    if (start !== -1) {
      bands.push({ start, end: i - 1, score });
      start = -1;
      score = 0;
    }
  }

  if (start !== -1) {
    bands.push({ start, end: values.length - 1, score });
  }

  return bands;
}

function pickBestBands(bands: Band[], expectedCount: number): Band[] {
  const filtered = bands.filter((band) => band.end - band.start + 1 >= 4);
  if (filtered.length <= expectedCount) {
    return filtered.sort((a, b) => a.start - b.start);
  }

  return filtered
    .sort((a, b) => b.score - a.score)
    .slice(0, expectedCount)
    .sort((a, b) => a.start - b.start);
}

function medianDiffByStart(bands: Band[]): number {
  const diffs: number[] = [];
  for (let i = 1; i < bands.length; i++) {
    diffs.push(bands[i].start - bands[i - 1].start);
  }
  return Math.round(median(diffs));
}

function sumRange(values: number[], start: number, end: number): number {
  let total = 0;
  const from = Math.max(0, start);
  const to = Math.min(values.length - 1, end);
  for (let i = from; i <= to; i++) total += values[i];
  return total;
}

function findBestLag(values: number[], minLag: number, maxLag: number): number {
  let bestLag = minLag;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let i = 0; i + lag < values.length; i++) {
      score += values[i] * values[i + lag];
    }
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  return bestLag;
}

function estimateAxisByPeriodicity(
  values: number[],
  expectedCount: number,
  baseFrame: number,
): { origin: number; frame: number; stride: number } {
  const minLag = Math.max(2, Math.floor(baseFrame * 0.7));
  const maxLag = Math.max(minLag, Math.floor((values.length - 1) / Math.max(1, expectedCount - 1)));
  const stride = findBestLag(values, minLag, maxLag);
  const frame = Math.max(1, Math.round(baseFrame));

  let bestOrigin = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let origin = 0; origin < stride; origin++) {
    let score = 0;
    for (let i = 0; i < expectedCount; i++) {
      const start = origin + i * stride;
      const end = start + frame - 1;
      if (end >= values.length) break;
      score += sumRange(values, start, end);
    }
    if (score > bestScore) {
      bestScore = score;
      bestOrigin = origin;
    }
  }

  return { origin: bestOrigin, frame, stride };
}

function detectBandsAdaptive(values: number[], expectedCount: number): Band[] {
  const smoothRadius = [2, 1, 0];
  const thresholdRatios = [0.08, 0.05, 0.03, 0.015];

  let best: Band[] = [];

  for (const radius of smoothRadius) {
    const series = smooth(values, radius);
    const maxValue = Math.max(...series);
    if (maxValue <= 0) continue;

    for (const ratio of thresholdRatios) {
      const bands = pickBestBands(detectBands(series, maxValue * ratio), expectedCount);
      if (bands.length > best.length) best = bands;
      if (bands.length >= expectedCount) return bands;
    }
  }

  return best;
}

function clampGridToImage(
  image: HTMLImageElement,
  columns: number,
  rows: number,
  values: { originX: number; originY: number; frameW: number; frameH: number; strideX: number; strideY: number },
): { originX: number; originY: number; frameW: number; frameH: number; strideX: number; strideY: number } {
  const out = { ...values };

  out.frameW = Math.max(1, out.frameW);
  out.frameH = Math.max(1, out.frameH);
  out.strideX = Math.max(1, out.strideX);
  out.strideY = Math.max(1, out.strideY);

  const maxOriginX = Math.max(0, image.width - out.frameW);
  const maxOriginY = Math.max(0, image.height - out.frameH);
  out.originX = Math.min(Math.max(0, out.originX), maxOriginX);
  out.originY = Math.min(Math.max(0, out.originY), maxOriginY);

  const maxStrideX = Math.max(1, Math.floor((image.width - out.originX - out.frameW) / Math.max(1, columns - 1)));
  const maxStrideY = Math.max(1, Math.floor((image.height - out.originY - out.frameH) / Math.max(1, rows - 1)));

  out.strideX = Math.min(out.strideX, maxStrideX);
  out.strideY = Math.min(out.strideY, maxStrideY);

  return out;
}

function autoDetectCutParams(
  image: HTMLImageElement,
  base: EditableConfig,
  columns: number,
  rows: number,
): { config: EditableConfig; status: string } {
  const scanCanvas = document.createElement('canvas');
  scanCanvas.width = image.width;
  scanCanvas.height = image.height;
  const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
  if (!scanCtx) {
    return { config: base, status: 'Auto Detect falló: no se pudo crear contexto de canvas.' };
  }

  scanCtx.drawImage(image, 0, 0);
  const data = scanCtx.getImageData(0, 0, image.width, image.height).data;

  const xInk = new Array(image.width).fill(0);
  const yInk = new Array(image.height).fill(0);

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const alpha = data[(y * image.width + x) * 4 + 3];
      if (alpha < 12) continue;
      xInk[x] += 1;
      yInk[y] += 1;
    }
  }

  const maxX = Math.max(...xInk);
  const maxY = Math.max(...yInk);

  if (maxX <= 0 || maxY <= 0) {
    return { config: base, status: 'Auto Detect falló: no se detectaron pixeles opacos.' };
  }

  const xBands = detectBandsAdaptive(xInk, columns);
  const yBands = detectBandsAdaptive(yInk, rows);

  let originX: number;
  let originY: number;
  let frameW: number;
  let frameH: number;
  let strideX: number;
  let strideY: number;
  let detectionMode = 'bands';

  if (xBands.length >= 2 && yBands.length >= 2) {
    originX = xBands[0].start;
    originY = yBands[0].start;
    frameW = Math.round(Math.max(...xBands.map((band) => band.end - band.start + 1)));
    frameH = Math.round(Math.max(...yBands.map((band) => band.end - band.start + 1)));
    strideX = medianDiffByStart(xBands);
    strideY = medianDiffByStart(yBands);
  } else {
    detectionMode = 'periodic-fallback';
    const xEstimate = estimateAxisByPeriodicity(xInk, columns, base.sourceFrameWidth);
    const yEstimate = estimateAxisByPeriodicity(yInk, rows, base.sourceFrameHeight);
    originX = xEstimate.origin;
    originY = yEstimate.origin;
    frameW = xEstimate.frame;
    frameH = yEstimate.frame;
    strideX = xEstimate.stride;
    strideY = yEstimate.stride;
  }

  const clamped = clampGridToImage(image, columns, rows, {
    originX,
    originY,
    frameW,
    frameH,
    strideX,
    strideY,
  });

  const detected: EditableConfig = {
    ...base,
    sourceOriginX: toInt(clamped.originX),
    sourceOriginY: toInt(clamped.originY),
    sourceFrameWidth: toPositiveInt(clamped.frameW),
    sourceFrameHeight: toPositiveInt(clamped.frameH),
    sourceStrideX: toPositiveInt(clamped.strideX),
    sourceStrideY: toPositiveInt(clamped.strideY),
  };

  const modeLabel = detectionMode === 'bands' ? 'bands' : 'fallback-periodic';
  const status = `Auto Detect OK (${modeLabel}): origin (${detected.sourceOriginX}, ${detected.sourceOriginY}), frame ${detected.sourceFrameWidth}x${detected.sourceFrameHeight}, stride ${detected.sourceStrideX}x${detected.sourceStrideY}.`;
  return { config: detected, status };
}

function setInputValues(editable: EditableConfig): void {
  const set = (id: string, value: number) => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (input) input.value = String(value);
  };

  set('sourceOriginX', editable.sourceOriginX);
  set('sourceOriginY', editable.sourceOriginY);
  set('sourceFrameWidth', editable.sourceFrameWidth);
  set('sourceFrameHeight', editable.sourceFrameHeight);
  set('sourceStrideX', editable.sourceStrideX);
  set('sourceStrideY', editable.sourceStrideY);
  set('renderWidth', editable.renderWidth);
  set('renderHeight', editable.renderHeight);
  set('anchorX', editable.anchor.x);
  set('anchorY', editable.anchor.y);
}

function readInputs(base: EditableConfig): EditableConfig {
  const next = cloneEditableConfig({ ...FIGHTER_SPRITE_CONFIG, ...base, anchor: { ...base.anchor } });

  Object.keys(INPUT_MAP).forEach((id) => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (!input) return;

    const raw = Number(input.value);
    if (!Number.isFinite(raw)) return;

    const key = INPUT_MAP[id];
    if (key === 'anchorX') {
      next.anchor.x = toInt(raw);
      return;
    }
    if (key === 'anchorY') {
      next.anchor.y = toInt(raw);
      return;
    }

    if (key === 'sourceFrameWidth' || key === 'sourceFrameHeight' || key === 'sourceStrideX' || key === 'sourceStrideY' || key === 'renderWidth' || key === 'renderHeight') {
      next[key] = toPositiveInt(raw) as never;
      return;
    }

    next[key] = toInt(raw) as never;
  });

  return next;
}

function updateStats(config: EditableConfig, image: HTMLImageElement): void {
  const statsSheet = document.getElementById('sheet-size');
  const statsConfig = document.getElementById('sheet-config');
  const statsGrid = document.getElementById('sheet-grid');

  if (statsSheet) {
    statsSheet.textContent = `Size: ${image.width}x${image.height}px`;
  }

  if (statsConfig) {
    statsConfig.textContent = `Origin: (${config.sourceOriginX}, ${config.sourceOriginY}) Frame: ${config.sourceFrameWidth}x${config.sourceFrameHeight} Stride: ${config.sourceStrideX}x${config.sourceStrideY}`;
  }

  if (statsGrid) {
    statsGrid.textContent = `Render: ${config.renderWidth}x${config.renderHeight} Anchor: (${config.anchor.x}, ${config.anchor.y})`;
  }
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  config: EditableConfig,
  sx: number,
  sy: number,
): void {
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, config.renderWidth, config.renderHeight);

  const checkSize = 8;
  ctx.fillStyle = '#1a1a1a';
  for (let y = 0; y < config.renderHeight; y += checkSize * 2) {
    for (let x = 0; x < config.renderWidth; x += checkSize * 2) {
      ctx.fillRect(x, y, checkSize, checkSize);
      ctx.fillRect(x + checkSize, y + checkSize, checkSize, checkSize);
    }
  }

  ctx.drawImage(
    image,
    sx,
    sy,
    config.sourceFrameWidth,
    config.sourceFrameHeight,
    0,
    0,
    config.renderWidth,
    config.renderHeight,
  );

  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, config.renderWidth, config.renderHeight);

  ctx.fillStyle = '#4a9eff';
  ctx.beginPath();
  ctx.arc(config.anchor.x, config.anchor.y, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#4a9eff';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(config.anchor.x - 1, config.anchor.y - 1, 3, 3);
}

function drawSheetOverlay(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  config: EditableConfig,
  columns: number,
  rows: number,
): void {
  const scale = image.width > 1000 ? 1000 / image.width : 1;
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const sx = scale;

  // Draw grid cells
  ctx.strokeStyle = 'rgba(74, 158, 255, 0.85)';
  ctx.lineWidth = 1;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = (config.sourceOriginX + col * config.sourceStrideX) * sx;
      const y = (config.sourceOriginY + row * config.sourceStrideY) * sx;
      const w = config.sourceFrameWidth * sx;
      const h = config.sourceFrameHeight * sx;
      ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    }
  }

  // Highlight first cell and draw origin marker
  ctx.strokeStyle = 'rgba(255, 222, 89, 0.95)';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    Math.round(config.sourceOriginX * sx) + 0.5,
    Math.round(config.sourceOriginY * sx) + 0.5,
    Math.round(config.sourceFrameWidth * sx),
    Math.round(config.sourceFrameHeight * sx),
  );

  ctx.fillStyle = '#ff5e7d';
  ctx.beginPath();
  ctx.arc(config.sourceOriginX * sx, config.sourceOriginY * sx, 4, 0, Math.PI * 2);
  ctx.fill();
}

function buildConfigSnippet(config: EditableConfig): string {
  return [
    `sourceFrameWidth: ${config.sourceFrameWidth},`,
    `sourceFrameHeight: ${config.sourceFrameHeight},`,
    `sourceOriginX: ${config.sourceOriginX},`,
    `sourceOriginY: ${config.sourceOriginY},`,
    `sourceStrideX: ${config.sourceStrideX},`,
    `sourceStrideY: ${config.sourceStrideY},`,
    `renderWidth: ${config.renderWidth},`,
    `renderHeight: ${config.renderHeight},`,
    `anchor: { x: ${config.anchor.x}, y: ${config.anchor.y} },`,
  ].join('\n');
}

async function copyConfigToClipboard(config: EditableConfig): Promise<boolean> {
  if (!navigator.clipboard) return false;
  await navigator.clipboard.writeText(buildConfigSnippet(config));
  return true;
}

function renderAll(
  container: HTMLElement,
  image: HTMLImageElement,
  config: EditableConfig,
): void {
  container.innerHTML = '';

  const entries = Object.entries(FIGHTER_SPRITE_CONFIG.clips);

  for (const [stateName, clip] of entries) {
    const section = document.createElement('div');
    section.className = 'state-section';

    const title = document.createElement('div');
    title.className = 'state-title';
    title.textContent = stateName;

    const info = document.createElement('div');
    info.className = 'state-info';
    info.textContent = `${clip.frameCount} frames @ ${clip.fps} fps${clip.loop ? ' (loop)' : ''}`;

    section.appendChild(title);
    section.appendChild(info);

    const grid = document.createElement('div');
    grid.className = 'frames-grid';

    for (let frameIndex = 0; frameIndex < clip.frameCount; frameIndex++) {
      const frameItem = document.createElement('div');
      frameItem.className = 'frame-item';

      const sx = config.sourceOriginX + frameIndex * config.sourceStrideX;
      const sy = config.sourceOriginY + clip.row * config.sourceStrideY;

      const canvas = document.createElement('canvas');
      canvas.className = 'frame-canvas';
      canvas.width = config.renderWidth;
      canvas.height = config.renderHeight;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawFrame(ctx, image, config, sx, sy);
      }

      const label = document.createElement('div');
      label.className = 'frame-label';
      label.textContent = `Frame ${frameIndex}`;

      const coords = document.createElement('div');
      coords.className = 'frame-coords';
      coords.textContent = `src (${sx}, ${sy}) cut ${config.sourceFrameWidth}x${config.sourceFrameHeight}`;

      frameItem.appendChild(canvas);
      frameItem.appendChild(label);
      frameItem.appendChild(coords);
      grid.appendChild(frameItem);
    }

    section.appendChild(grid);
    container.appendChild(section);
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load spritesheet'));
    image.src = url;
  });
}

async function main(): Promise<void> {
  const container = document.getElementById('framesContainer');
  const sheetCanvas = document.getElementById('sheetCanvas') as HTMLCanvasElement | null;
  const applyBtn = document.getElementById('applyBtn');
  const autoDetectBtn = document.getElementById('autoDetectBtn');
  const copyConfigBtn = document.getElementById('copyConfigBtn');
  const resetBtn = document.getElementById('resetBtn');
  const detectStatus = document.getElementById('detectStatus');

  if (!container || !sheetCanvas || !applyBtn || !autoDetectBtn || !copyConfigBtn || !resetBtn) return;

  const image = await loadImage(FIGHTER_SPRITE_CONFIG.imageUrl);
  const defaults = cloneEditableConfig(FIGHTER_SPRITE_CONFIG);
  let current = cloneEditableConfig(FIGHTER_SPRITE_CONFIG);

  const rerender = () => {
    updateStats(current, image);
    drawSheetOverlay(sheetCanvas, image, current, FIGHTER_SPRITE_CONFIG.columns, FIGHTER_SPRITE_CONFIG.rows);
    renderAll(container, image, current);
  };

  const setDetectStatus = (message: string) => {
    if (!detectStatus) return;
    detectStatus.textContent = message;
  };

  setInputValues(current);
  setDetectStatus('Auto Detect usa alpha del PNG para estimar origin/frame/stride.');
  rerender();

  applyBtn.addEventListener('click', () => {
    current = readInputs(current);
    setInputValues(current);
    setDetectStatus('Parámetros aplicados manualmente.');
    rerender();
  });

  autoDetectBtn.addEventListener('click', () => {
    const result = autoDetectCutParams(image, current, FIGHTER_SPRITE_CONFIG.columns, FIGHTER_SPRITE_CONFIG.rows);
    current = result.config;
    setInputValues(current);
    setDetectStatus(result.status);
    rerender();
  });

  copyConfigBtn.addEventListener('click', async () => {
    try {
      const ok = await copyConfigToClipboard(current);
      if (!ok) {
        setDetectStatus('No se pudo copiar automaticamente. Copia manualmente desde consola: copy(buildConfigSnippet).');
        return;
      }
      setDetectStatus('Config copiada al portapapeles.');
    } catch {
      setDetectStatus('Falló la copia al portapapeles.');
    }
  });

  resetBtn.addEventListener('click', () => {
    current = cloneEditableConfig({ ...FIGHTER_SPRITE_CONFIG, ...defaults, anchor: { ...defaults.anchor } });
    setInputValues(current);
    setDetectStatus('Valores restablecidos al manifest actual.');
    rerender();
  });

  Object.keys(INPUT_MAP).forEach((id) => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (!input) return;

    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      current = readInputs(current);
      setInputValues(current);
      setDetectStatus('Parámetros aplicados manualmente.');
      rerender();
    });
  });

  sheetCanvas.addEventListener('click', (event) => {
    const rect = sheetCanvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const scaleX = image.width / sheetCanvas.width;
    const scaleY = image.height / sheetCanvas.height;

    current.sourceOriginX = toInt(px * scaleX);
    current.sourceOriginY = toInt(py * scaleY);
    setInputValues(current);
    setDetectStatus('Origin actualizado desde click en el PNG.');
    rerender();
  });
}

main().catch((error) => {
  console.error(error);
});
