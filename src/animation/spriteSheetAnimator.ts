import type { AnimationClip } from './types';
import type { FighterState } from '../fighter';

interface TrackState {
  state: FighterState;
  elapsedMs: number;
}

export class SpriteSheetAnimator {
  private readonly tracks = new Map<number, TrackState>();

  getFrame(entityId: number, state: FighterState, clip: AnimationClip, deltaMs: number): number {
    const track = this.tracks.get(entityId);

    if (!track || track.state !== state) {
      this.tracks.set(entityId, { state, elapsedMs: 0 });
      return 0;
    }

    const nextElapsed = Math.max(0, track.elapsedMs + deltaMs);
    track.elapsedMs = nextElapsed;

    const rawFrame = Math.floor((nextElapsed / 1000) * clip.fps);
    if (clip.loop) return rawFrame % clip.frameCount;
    return Math.min(rawFrame, clip.frameCount - 1);
  }

  reset(entityId: number): void {
    this.tracks.delete(entityId);
  }
}
