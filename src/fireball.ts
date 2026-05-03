import type { Vec2 } from './types';

const FIREBALL_SPEED = 9;
const FIREBALL_DAMAGE = 20;
const FIREBALL_RADIUS = 12;

export class Fireball {
  pos: Vec2;
  readonly vel: Vec2;
  readonly ownerIndex: number;
  readonly color: string;
  readonly radius = FIREBALL_RADIUS;
  readonly damage = FIREBALL_DAMAGE;
  active = true;

  constructor(x: number, y: number, facingRight: boolean, ownerIndex: number, color: string) {
    this.pos = { x, y };
    this.vel = { x: facingRight ? FIREBALL_SPEED : -FIREBALL_SPEED, y: 0 };
    this.ownerIndex = ownerIndex;
    this.color = color;
  }

  update(canvasWidth: number): void {
    this.pos.x += this.vel.x;
    if (this.pos.x < -this.radius || this.pos.x > canvasWidth + this.radius) {
      this.active = false;
    }
  }
}
