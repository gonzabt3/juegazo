import { Fighter } from '../fighter';
import { SpriteSheetAnimator } from './spriteSheetAnimator';
import type { SpriteSheetConfig } from './types';

export class FighterSpriteRenderer {
  private readonly image = new Image();
  private imageReady = false;
  private sheetValid = false;
  private readonly config: SpriteSheetConfig;
  private readonly animator: SpriteSheetAnimator;
  private readonly frameOffsets = new Map<string, { x: number; y: number }>();

  constructor(config: SpriteSheetConfig, animator: SpriteSheetAnimator) {
    this.config = config;
    this.animator = animator;
    this.image.decoding = 'async';
    this.image.onload = () => {
      this.imageReady = true;
      this.sheetValid =
        this.image.width >= this.config.sourceOriginX + this.config.columns * this.config.sourceStrideX &&
        this.image.height >= this.config.sourceOriginY + this.config.rows * this.config.sourceStrideY;

      if (!this.sheetValid) {
        console.warn('[SpriteRenderer] spritesheet size is smaller than configured grid, using fallback renderer.');
        return;
      }

      this.computeFrameOffsets();
    };
    this.image.onerror = () => {
      this.imageReady = false;
      this.sheetValid = false;
      console.warn('[SpriteRenderer] failed to load spritesheet, using fallback renderer.');
    };
    this.image.src = this.config.imageUrl;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    fighter: Fighter,
    playerNum: number,
    deltaMs: number,
  ): boolean {
    if (!this.imageReady || !this.sheetValid) return false;

    const clip = this.config.clips[fighter.state];
    const frameIndex = this.animator.getFrame(playerNum, fighter.state, clip, deltaMs);

    const sx = this.config.sourceOriginX + frameIndex * this.config.sourceStrideX;
    const sy = this.config.sourceOriginY + clip.row * this.config.sourceStrideY;
    const key = `${clip.row}:${frameIndex}`;
    const offset = this.frameOffsets.get(key) || { x: 0, y: 0 };

    const dx = fighter.pos.x + fighter.width / 2 - this.config.anchor.x + offset.x;
    const dy = fighter.pos.y + fighter.height - this.config.anchor.y + offset.y;

    ctx.save();
    if (fighter.isDead) ctx.globalAlpha = 0.4;

    if (fighter.facingRight) {
      ctx.drawImage(
        this.image,
        sx,
        sy,
        this.config.sourceFrameWidth,
        this.config.sourceFrameHeight,
        dx,
        dy,
        this.config.renderWidth,
        this.config.renderHeight,
      );
    } else {
      ctx.translate(dx + this.config.renderWidth, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(
        this.image,
        sx,
        sy,
        this.config.sourceFrameWidth,
        this.config.sourceFrameHeight,
        0,
        0,
        this.config.renderWidth,
        this.config.renderHeight,
      );
    }

    ctx.restore();
    return true;
  }

  private computeFrameOffsets(): void {
    const frameWidth = this.config.sourceFrameWidth;
    const frameHeight = this.config.sourceFrameHeight;

    const canvas = document.createElement('canvas');
    canvas.width = frameWidth;
    canvas.height = frameHeight;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    Object.values(this.config.clips).forEach((clip) => {
      const anchorsByFrame: Array<{ centerX: number; footY: number } | null> = [];

      for (let frame = 0; frame < clip.frameCount; frame++) {
        const sx = this.config.sourceOriginX + frame * this.config.sourceStrideX;
        const sy = this.config.sourceOriginY + clip.row * this.config.sourceStrideY;
        ctx.clearRect(0, 0, frameWidth, frameHeight);
        ctx.drawImage(this.image, sx, sy, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);

        const data = ctx.getImageData(0, 0, frameWidth, frameHeight).data;
        let minX = frameWidth;
        let maxX = -1;
        let maxY = -1;

        for (let y = 0; y < frameHeight; y++) {
          for (let x = 0; x < frameWidth; x++) {
            const alpha = data[(y * frameWidth + x) * 4 + 3];
            if (alpha < 12) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }

        if (maxX === -1 || maxY === -1) {
          anchorsByFrame.push(null);
          continue;
        }

        // Use full bounding box center to ensure consistent horizontal alignment across all frames
        const centerX = (minX + maxX) / 2;

        anchorsByFrame.push({
          centerX,
          footY: maxY,
        });
      }

      const validAnchors = anchorsByFrame.filter(Boolean) as Array<{ centerX: number; footY: number }>;
      if (validAnchors.length === 0) return;

      // Calculate average X position of all sprites in this row to center against real distribution
      const avgCenterX = validAnchors.reduce((sum, a) => sum + a.centerX, 0) / validAnchors.length;
      const cellFootY = Math.max(...validAnchors.map(anchor => anchor.footY));

      for (let frame = 0; frame < clip.frameCount; frame++) {
        const current = anchorsByFrame[frame] || validAnchors[0];
        this.frameOffsets.set(`${clip.row}:${frame}`, {
          x: (avgCenterX - current.centerX) * (this.config.renderWidth / this.config.sourceFrameWidth),
          y: (cellFootY - current.footY) * (this.config.renderHeight / this.config.sourceFrameHeight),
        });
      }
    });
  }
}
