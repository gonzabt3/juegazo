import type { Vec2, Controls } from './types';
import type { FighterCommand } from './input/commands';
import { Fireball } from './fireball';
import { WORLD_WIDTH } from './world';

const GRAVITY = 0.85;
const MOVE_SPEED = 5.2;
const JUMP_FORCE = -18.5;
const ATTACK_RANGE = 95;
const ATTACK_DAMAGE = 8;

export type FighterState = 'IDLE' | 'MOVING' | 'JUMPING' | 'ATTACKING' | 'KICKING' | 'BLOCKING' | 'HIT';

export interface IFighter {
  pos: Vec2;
  vel: Vec2;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  color: string;
  facingRight: boolean;
  isAttacking: boolean;
  isOnGround: boolean;
  isDead: boolean;
  controls: Controls;
  label: string;
  state: FighterState;
  isBlocking: boolean;
  isKicking: boolean;
  pendingFireball: Fireball | null;

  applyCommands(commands: FighterCommand[], opponent: IFighter): void;
  tick(groundY: number): void;
  takeDamage(amount: number): void;
}

export class Fighter implements IFighter {
  pos: Vec2;
  vel: Vec2;
  readonly width = 68;
  readonly height = 108;
  health: number;
  readonly maxHealth = 100;
  readonly color: string;
  facingRight: boolean;
  isAttacking = false;
  private attackTimer = 0;
  private readonly attackDuration = 15;
  private readonly attackCooldown = 30;
  private cooldownTimer = 0;
  isOnGround = true;
  isDead = false;
  readonly controls: Controls;
  readonly label: string;
  state: FighterState = 'IDLE';
  isBlocking = false;
  isKicking = false;
  pendingFireball: Fireball | null = null;
  private hitTimer = 0;
  private readonly hitDuration = 20;
  private fireballCooldownTimer = 0;
  private readonly fireballCooldown = 60;
  private kickTimer = 0;
  private readonly kickDuration = 18;
  private readonly kickCooldown = 35;
  private kickCooldownTimer = 0;
  private readonly kickRange = 74;
  private readonly kickDamage = 14;
  constructor(x: number, color: string, facingRight: boolean, controls: Controls, label: string) {
    this.pos = { x, y: 0 };
    this.vel = { x: 0, y: 0 };
    this.health = this.maxHealth;
    this.color = color;
    this.facingRight = facingRight;
    this.controls = controls;
    this.label = label;
  }

  applyCommands(commands: FighterCommand[], opponent: IFighter): void {
    if (this.isDead) return;

    this.isBlocking = commands.includes('BLOCK');
    this.pendingFireball = null;

    // No se puede mover ni atacar mientras bloquea
    if (this.isBlocking) {
      this.vel.x = 0;
      this.state = this.resolveState();
      return;
    }

    this.vel.x = 0;
    if (commands.includes('MOVE_LEFT'))  { this.vel.x = -MOVE_SPEED; this.facingRight = false; }
    if (commands.includes('MOVE_RIGHT')) { this.vel.x = MOVE_SPEED;  this.facingRight = true;  }

    if (commands.includes('JUMP') && this.isOnGround) {
      this.vel.y = JUMP_FORCE;
      this.isOnGround = false;
    }

    if (this.cooldownTimer > 0) this.cooldownTimer--;
    if (this.fireballCooldownTimer > 0) this.fireballCooldownTimer--;
    if (this.kickCooldownTimer > 0) this.kickCooldownTimer--;
    if (this.attackTimer > 0) {
      this.attackTimer--;
      this.isAttacking = true;
    } else {
      this.isAttacking = false;
    }

    if (this.kickTimer > 0) {
      this.kickTimer--;
      this.isKicking = true;
    } else {
      this.isKicking = false;
    }

    if (commands.includes('ATTACK') && this.cooldownTimer === 0) {
      this.isAttacking = true;
      this.attackTimer = this.attackDuration;
      this.cooldownTimer = this.attackCooldown;
      this.tryHit(opponent);
    }

    if (commands.includes('KICK') && this.kickCooldownTimer === 0) {
      this.isKicking = true;
      this.kickTimer = this.kickDuration;
      this.kickCooldownTimer = this.kickCooldown;
      this.tryKick(opponent);
    }

    if (commands.includes('FIREBALL') && this.fireballCooldownTimer === 0 && this.isOnGround) {
      const spawnX = this.facingRight ? this.pos.x + this.width + 10 : this.pos.x - 10;
      const spawnY = this.pos.y + this.height * 0.3;
      this.pendingFireball = new Fireball(spawnX, spawnY, this.facingRight, 0, this.color);
      this.fireballCooldownTimer = this.fireballCooldown;
    }

    this.state = this.resolveState();
  }

  tick(groundY: number): void {
    if (this.isDead) return;
    if (this.hitTimer > 0) this.hitTimer--;

    this.vel.y += GRAVITY;
    this.pos.x += this.vel.x;
    this.pos.y += this.vel.y;

    if (this.pos.y >= groundY) {
      this.pos.y = groundY;
      this.vel.y = 0;
      this.isOnGround = true;
    }

    this.pos.x = Math.max(0, Math.min(WORLD_WIDTH - this.width, this.pos.x));
    this.state = this.resolveState();
  }

  private resolveState(): FighterState {
    if (this.hitTimer > 0)    return 'HIT';
    if (this.isBlocking)      return 'BLOCKING';
    if (this.isKicking)       return 'KICKING';
    if (this.isAttacking)     return 'ATTACKING';
    if (!this.isOnGround)     return 'JUMPING';
    if (this.vel.x !== 0)     return 'MOVING';
    return 'IDLE';
  }

  private tryKick(opponent: IFighter): void {
    if (opponent.isDead) return;
    const kickX = this.facingRight
      ? this.pos.x + this.width
      : this.pos.x - this.kickRange;
    const hits = this.rectsOverlap(
      { x: kickX, y: this.pos.y + this.height * 0.5, w: this.kickRange, h: this.height * 0.5 },
      { x: opponent.pos.x, y: opponent.pos.y, w: opponent.width, h: opponent.height }
    );
    if (hits) {
      opponent.takeDamage(this.kickDamage);
      // Knockback: empuja al oponente hacia atrás
      const knockback = this.facingRight ? 7 : -7;
      (opponent as Fighter).vel.x = knockback;
    }
  }

  private tryHit(opponent: IFighter): void {
    if (opponent.isDead) return;

    const attackX = this.facingRight
      ? this.pos.x + this.width
      : this.pos.x - ATTACK_RANGE;

    const hits = this.rectsOverlap(
      { x: attackX, y: this.pos.y, w: ATTACK_RANGE, h: this.height },
      { x: opponent.pos.x, y: opponent.pos.y, w: opponent.width, h: opponent.height }
    );

    if (hits) {
      opponent.takeDamage(ATTACK_DAMAGE);
    }
  }

  takeDamage(amount: number): void {
    const dmg = this.isBlocking ? Math.floor(amount * 0.15) : amount;
    this.health = Math.max(0, this.health - dmg);
    if (this.health === 0) this.isDead = true;
    if (!this.isBlocking) {
      this.hitTimer = this.hitDuration;
      this.state = 'HIT';
    }
  }

  get attackRange(): number {
    return ATTACK_RANGE;
  }

  private rectsOverlap(
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number }
  ): boolean {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }
}
