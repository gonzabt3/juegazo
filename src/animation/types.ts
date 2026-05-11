import type { FighterState } from '../fighter';

export interface AnimationClip {
  row: number;
  frameCount: number;
  fps: number;
  loop: boolean;
}

export interface SpriteAnchor {
  x: number;
  y: number;
}

export interface SpriteSheetConfig {
  imageUrl: string;
  sourceFrameWidth: number;
  sourceFrameHeight: number;
  sourceOriginX: number;
  sourceOriginY: number;
  sourceStrideX: number;
  sourceStrideY: number;
  renderWidth: number;
  renderHeight: number;
  columns: number;
  rows: number;
  anchor: SpriteAnchor;
  clips: Record<FighterState, AnimationClip>;
}
