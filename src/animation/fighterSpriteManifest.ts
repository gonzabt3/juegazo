import type { SpriteSheetConfig } from './types';

const configuredUrl = import.meta.env.VITE_FIGHTER_SPRITESHEET_URL as string | undefined;
const defaultUrl = new URL('../../tes_character.png', import.meta.url).href;

export const FIGHTER_SPRITE_CONFIG: SpriteSheetConfig = {
  imageUrl: configuredUrl || defaultUrl,
  // Contract for AI-generated sheet: 8x7 grid, 128x128 cells, no margins.
  sourceFrameWidth: 128,
  sourceFrameHeight: 128,
  sourceOriginX: 0,
  sourceOriginY: 0,
  sourceStrideX: 128,
  sourceStrideY: 128,
  renderWidth: 128,
  renderHeight: 128,
  columns: 8,
  rows: 7,
  // Foot anchor near the lower center of each 128x128 cell.
  anchor: { x: 64, y: 122 },
  clips: {
    IDLE: { row: 0, frameCount: 6, fps: 8, loop: true },
    MOVING: { row: 1, frameCount: 8, fps: 12, loop: true },
    JUMPING: { row: 2, frameCount: 4, fps: 10, loop: false },
    ATTACKING: { row: 3, frameCount: 6, fps: 14, loop: false },
    KICKING: { row: 4, frameCount: 6, fps: 14, loop: false },
    BLOCKING: { row: 5, frameCount: 2, fps: 6, loop: true },
    HIT: { row: 6, frameCount: 3, fps: 12, loop: false },
  },
};
