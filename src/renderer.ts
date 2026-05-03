import { Fighter } from './fighter';
import type { FighterState } from './fighter';
import { Fireball } from './fireball';

const STATE_TINT: Record<FighterState, string | null> = {
  IDLE:      null,
  MOVING:    'rgba(255,255,255,0.12)',
  JUMPING:   'rgba(100,200,255,0.18)',
  ATTACKING: 'rgba(255,220,0,0.25)',
  KICKING:   'rgba(200,100,255,0.28)',
  BLOCKING:  'rgba(80,180,255,0.30)',
  HIT:       'rgba(255,50,50,0.40)',
};

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly width: number;
  private readonly height: number;

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
  }

  draw(fighters: [Fighter, Fighter], fireballs: Fireball[], groundY: number, winner: number | null, roomId?: string | null): void {
    this.drawBackground(groundY);
    fireballs.forEach(fb => this.drawFireball(fb));
    fighters.forEach((f, i) => this.drawFighter(f, i + 1));
    this.drawHealthBar(fighters[0], 20, 20, 1);
    this.drawHealthBar(fighters[1], this.width - 220, 20, 2);
    this.drawControls();
    if (roomId) this.drawRoomCode(roomId);
    if (winner !== null) this.drawWinScreen(winner);
  }

  private drawFireball(fb: Fireball): void {
    const { ctx } = this;
    ctx.save();

    // Halo exterior
    const glow = ctx.createRadialGradient(fb.pos.x, fb.pos.y, 2, fb.pos.x, fb.pos.y, fb.radius * 2.2);
    glow.addColorStop(0, fb.color);
    glow.addColorStop(0.5, 'rgba(255,120,0,0.6)');
    glow.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(fb.pos.x, fb.pos.y, fb.radius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Núcleo
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(fb.pos.x, fb.pos.y, fb.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();

    // Bola principal
    ctx.fillStyle = '#ff6a00';
    ctx.beginPath();
    ctx.arc(fb.pos.x, fb.pos.y, fb.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawBackground(groundY: number): void {
    const { ctx } = this;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#444';
    ctx.fillRect(0, groundY + 80, this.width, this.height - groundY - 80);
    ctx.fillStyle = '#666';
    ctx.fillRect(0, groundY + 78, this.width, 4);
  }

  private drawFighter(fighter: Fighter, playerNum: number): void {
    const { ctx } = this;
    const { pos, width, height, color, isAttacking, facingRight, isDead, attackRange } = fighter;

    ctx.save();
    if (isDead) ctx.globalAlpha = 0.4;

    // Cuerpo
    ctx.fillStyle = color;
    ctx.fillRect(pos.x, pos.y, width, height);

    // Tinte de estado
    const tint = STATE_TINT[fighter.state];
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(pos.x, pos.y, width, height);
    }

    // Cabeza
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pos.x + width / 2, pos.y - 15, 18, 0, Math.PI * 2);
    ctx.fill();

    // Ojos
    const eyeOffsetX = facingRight ? 6 : -6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(pos.x + width / 2 + eyeOffsetX, pos.y - 18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(pos.x + width / 2 + eyeOffsetX + (facingRight ? 1 : -1), pos.y - 18, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Etiqueta jugador + estado
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`P${playerNum}`, pos.x + width / 2, pos.y - 38);
    ctx.font = '10px monospace';
    ctx.fillStyle = fighter.state === 'BLOCKING' ? '#50b4ff' : 'rgba(255,255,255,0.6)';
    ctx.fillText(fighter.state, pos.x + width / 2, pos.y - 52);

    // Escudo de bloqueo
    if (fighter.isBlocking) {
      const shieldX = facingRight ? pos.x + width : pos.x - 14;
      ctx.fillStyle = 'rgba(80,180,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(shieldX, pos.y + height * 0.4, 10, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Puño
    if (isAttacking) {
      const fistX = facingRight
        ? pos.x + width + attackRange - 10
        : pos.x - 10;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(fistX, pos.y + height * 0.3, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Patada
    if (fighter.isKicking) {
      const legStartX = pos.x + width * 0.5;
      const legStartY = pos.y + height * 0.75;
      const legEndX   = facingRight ? pos.x + width + 40 : pos.x - 40;
      const legEndY   = pos.y + height * 0.9;
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(legStartX, legStartY);
      ctx.lineTo(legEndX, legEndY);
      ctx.stroke();
      // Pie
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(legEndX, legEndY, 12, 8, facingRight ? 0.3 : -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawHealthBar(fighter: Fighter, x: number, y: number, playerNum: number): void {
    const { ctx } = this;
    const barWidth = 200;
    const barHeight = 22;
    const ratio = fighter.health / fighter.maxHealth;

    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, barWidth, barHeight);

    const hpColor = ratio > 0.5 ? '#4caf50' : ratio > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillStyle = hpColor;
    ctx.fillRect(x, y, barWidth * ratio, barHeight);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, barWidth, barHeight);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`P${playerNum}  ${fighter.health} / ${fighter.maxHealth}`, x + 6, y + 15);
  }

  private drawControls(): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('P1: WASD  F=puño  H=patada  S=bloqueo  G=fuego', 20, this.height - 24);
    ctx.textAlign = 'right';
    ctx.fillText('P2: flechas  L=puño  J=patada  ↓=bloqueo  K=fuego', this.width - 20, this.height - 24);
    ctx.textAlign = 'center';
    ctx.fillText('R = reiniciar', this.width / 2, this.height - 8);
  }

  private drawWinScreen(winner: number): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 60px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`¡Jugador ${winner + 1} gana!`, this.width / 2, this.height / 2 - 20);
    ctx.font = '24px monospace';
    ctx.fillText('Presioná R para reiniciar', this.width / 2, this.height / 2 + 40);
  }

  private drawRoomCode(roomId: string): void {
    const { ctx } = this;
    const cx = this.width / 2;
    const y = 18;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const text = `🎮 SALA: ${roomId}`;
    const metrics = ctx.measureText(text);
    ctx.fillRect(cx - metrics.width / 2 - 10, y - 14, metrics.width + 20, 22);
    ctx.fillStyle = '#fafc30';
    ctx.fillText(text, cx, y);
  }
}

