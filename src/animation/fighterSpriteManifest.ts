import type { SpriteSheetConfig } from './types';

const configuredUrl = import.meta.env.VITE_FIGHTER_SPRITESHEET_URL as string | undefined;
const defaultUrl = new URL('../../tes_character.png', import.meta.url).href;

export const FIGHTER_SPRITE_CONFIG: SpriteSheetConfig = {
  imageUrl: configuredUrl || defaultUrl,
  // This sheet has margins and larger cells than the in-game render size.
  sourceFrameWidth: 135,
  sourceFrameHeight: 150,
  sourceOriginX: 1,
  sourceOriginY: 1,
  sourceStrideX: 130,
  sourceStrideY: 128,
  renderWidth: 96,
  renderHeight: 96,
  columns: 8,
  rows: 7,
  // "Pies al centro" en la base del frame para alinear con ground/hitbox del Fighter.
  anchor: { x: 48, y: 94 },
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
