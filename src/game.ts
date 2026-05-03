import { Fighter } from './fighter';
import { Fireball } from './fireball';
import { Renderer } from './renderer';
import { InputHandler } from './input/inputHandler';
import { io, type Socket } from 'socket.io-client';
import type { Controls } from './types';
import type { FighterCommand } from './input/commands';

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
  private remoteCommands: [FighterCommand[], FighterCommand[]] = [[], []];
  private socket: Socket | null = null;
  private roomId: string | null = null;
  private peers: [RTCPeerConnection | null, RTCPeerConnection | null] = [null, null];

  private static readonly STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  private static readonly USE_KEYBOARD = import.meta.env.VITE_CONNECTION_MODE !== 'local' && import.meta.env.DEV;

  constructor(canvas: HTMLCanvasElement) {
    console.log('[Game] USE_KEYBOARD:', Game.USE_KEYBOARD);
    console.log('[Game] VITE_CONNECTION_MODE:', import.meta.env.VITE_CONNECTION_MODE);
    console.log('[Game] DEV:', import.meta.env.DEV);
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
    if (!Game.USE_KEYBOARD) return;
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
    const cmds1 = Game.USE_KEYBOARD
      ? this.inputHandler.getCommands(this.pressedKeys, CONTROLS_P1)
      : this.remoteCommands[0];
    const cmds2 = Game.USE_KEYBOARD
      ? this.inputHandler.getCommands(this.pressedKeys, CONTROLS_P2)
      : this.remoteCommands[1];
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
          if (this.socket && this.roomId) {
            this.socket.emit('player_hit', { playerIndex: idx });
          }
        }
      });
    }
    this.fireballs = this.fireballs.filter(fb => fb.active);

    p1.tick(GROUND_Y);
    p2.tick(GROUND_Y);

    if (p1.isDead) this.winner = 1;
    else if (p2.isDead) this.winner = 0;
  }

  connectToServer(): void {
    const url = import.meta.env.VITE_SERVER_URL as string;
    console.log('[Game] connectToServer → url:', url);
    this.socket = io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 250,
      reconnectionDelayMax: 1000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] conectado, id:', this.socket?.id);
      this.socket!.emit('create_room');
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Socket] error de conexión:', err.message);
    });

    this.socket.on('room_created', ({ roomId }: { roomId: string }) => {
      this.roomId = roomId;
      console.log('[Socket] sala creada:', roomId);
    });

    this.socket.on('commands', (data: { playerIndex: 0 | 1; commands: FighterCommand[] }) => {
      // Solo aplica si no hay DataChannel activo para ese player (fallback)
      if (!this.peers[data.playerIndex]) {
        this.remoteCommands[data.playerIndex] = data.commands;
      }
    });

    // ── WebRTC signaling ──────────────────────────────────────────────────────
    this.socket.on('rtc_offer', ({ playerIndex, sdp }: { playerIndex: 0 | 1; sdp: RTCSessionDescriptionInit }) => {
      const pc = new RTCPeerConnection(Game.STUN);
      this.peers[playerIndex] = pc;

      pc.ondatachannel = (e) => {
        const dc = e.channel;
        dc.onmessage = (msg) => {
          try {
            this.remoteCommands[playerIndex] = JSON.parse(msg.data as string) as FighterCommand[];
          } catch { /* ignorar */ }
        };
        dc.onclose = () => { this.peers[playerIndex] = null; };
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.socket!.emit('rtc_ice', { playerIndex, candidate: e.candidate.toJSON(), fromDisplay: true });
        }
      };

      pc.setRemoteDescription(new RTCSessionDescription(sdp))
        .then(() => pc.createAnswer())
        .then(answer => {
          pc.setLocalDescription(answer);
          this.socket!.emit('rtc_answer', { playerIndex, sdp: answer });
        })
        .catch(() => { this.peers[playerIndex] = null; });
    });

    this.socket.on('rtc_ice', ({ playerIndex, candidate }: { playerIndex: 0 | 1; candidate: RTCIceCandidateInit }) => {
      this.peers[playerIndex]?.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => { /* ignorar */ });
    });

    this.socket.on('player_connected', ({ playerIndex }: { playerIndex: 0 | 1 }) => {
      console.log(`[Socket] P${playerIndex + 1} conectado`);
    });

    this.socket.on('player_disconnected', ({ playerIndex }: { playerIndex: 0 | 1 }) => {
      this.remoteCommands[playerIndex] = [];
      console.log(`[Socket] P${playerIndex + 1} desconectado`);
    });
  }

  receiveCommands(playerIndex: 0 | 1, commands: FighterCommand[]): void {
    this.remoteCommands[playerIndex] = commands;
  }

  start(): void {
    const loop = (): void => {
      this.update();
      this.renderer.draw(this.fighters, this.fireballs, GROUND_Y, this.winner, this.roomId);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
