import { Fighter } from './fighter';
import { Fireball } from './fireball';
import { Renderer } from './renderer';
import { InputHandler } from './input/inputHandler';
import type { Controls } from './types';

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 500;
const GROUND_Y = CANVAS_HEIGHT - 80;

const CONTROLS_P1: Controls = { left: 'a', right: 'd', jump: 'w', attack: 'f', block: 's', fireball: 'g', kick: 'h' };
const CONTROLS_P2: Controls = { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', attack: 'l', block: 'ArrowDown', fireball: 'k', kick: 'j' };

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: Renderer;
  private readonly inputHandler = new InputHandler();
  private fighters!: [Fighter, Fighter];
  private fireballs: Fireball[] = [];
  private pressedKeys = new Set<string>();
  private winner: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo obtener el contexto 2D del canvas');

    this.renderer = new Renderer(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.reset();
    this.bindInput();
  }

  private reset(): void {
    this.fighters = [
      new Fighter(150, '#4af', true, CONTROLS_P1, 'P1'),
      new Fighter(CANVAS_WIDTH - 200, '#f64', false, CONTROLS_P2, 'P2'),
    ];
    this.fighters[0].pos.y = GROUND_Y;
    this.fighters[1].pos.y = GROUND_Y;
    this.fireballs = [];
    this.winner = null;
  }

  private bindInput(): void {
    window.addEventListener('keydown', (e) => {
      this.pressedKeys.add(e.key);
      if (e.key === 'r' || e.key === 'R') this.reset();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.pressedKeys.delete(e.key));
  }

  private update(): void {
    if (this.winner !== null) return;

    const [p1, p2] = this.fighters;
    const cmds1 = this.inputHandler.getCommands(this.pressedKeys, CONTROLS_P1);
    const cmds2 = this.inputHandler.getCommands(this.pressedKeys, CONTROLS_P2);
    p1.applyCommands(cmds1, p2);
    p2.applyCommands(cmds2, p1);

    // Recolectar fireballs nuevas
    this.fighters.forEach((f, i) => {
      if (f.pendingFireball) {
        f.pendingFireball.ownerIndex === 0; // solo para tipado
        const fb = f.pendingFireball;
        // Corregir ownerIndex según índice real
        (fb as { ownerIndex: number }).ownerIndex = i;
        this.fireballs.push(fb);
      }
    });

    // Actualizar fireballs y detectar colisiones
    for (const fb of this.fireballs) {
      fb.update(CANVAS_WIDTH);
      if (!fb.active) continue;
      this.fighters.forEach((fighter, idx) => {
        if (idx === fb.ownerIndex || fighter.isDead) return;
        const { pos, width, height } = fighter;
        const cx = pos.x + width / 2;
        const cy = pos.y + height / 2;
        const dist = Math.hypot(fb.pos.x - cx, fb.pos.y - cy);
        if (dist < fb.radius + Math.min(width, height) / 2) {
          fighter.takeDamage(fb.damage);
          fb.active = false;
        }
      });
    }
    this.fireballs = this.fireballs.filter(fb => fb.active);

    p1.tick(GROUND_Y);
    p2.tick(GROUND_Y);

    if (p1.isDead) this.winner = 1;
    else if (p2.isDead) this.winner = 0;
  }

  start(): void {
    const loop = (): void => {
      this.update();
      this.renderer.draw(this.fighters, this.fireballs, GROUND_Y, this.winner);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
