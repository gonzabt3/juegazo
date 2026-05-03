import { io } from 'socket.io-client';

type FighterCommand = 'MOVE_LEFT' | 'MOVE_RIGHT' | 'JUMP' | 'ATTACK' | 'BLOCK' | 'FIREBALL' | 'KICK';
type PlayerIndex = 0 | 1;

// ─── State ───────────────────────────────────────────────────────────────────
const pressed = new Set<FighterCommand>();
let connected = false;

// ─── Socket ───────────────────────────────────────────────────────────────────
const SERVER_URL = import.meta.env.VITE_SERVER_URL as string;
const socket = io(SERVER_URL, { autoConnect: false });
let lastEmitLogAt = 0;

socket.on('joined', ({ playerIndex: pi }: { playerIndex: PlayerIndex }) => {
  console.log('[Controller] joined as', pi + 1);
  setStatus(`Conectado como P${pi + 1} ✔`);
  showController();
  connected = true;
  scheduleEmit();
});

socket.on('join_error', (msg: string) => {
  console.error('[Controller] join_error:', msg);
  setStatus(`Error: ${msg}`);
});

socket.on('vibrate', () => {
  if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
});

// ─── UI Setup ─────────────────────────────────────────────────────────────────
const setupEl    = document.getElementById('setup')!;
const controllerEl = document.getElementById('controller')!;
const roomInput  = document.getElementById('roomInput') as HTMLInputElement;
const btnP1      = document.getElementById('btnP1')!;
const btnP2      = document.getElementById('btnP2')!;
const btnJoin    = document.getElementById('btnJoin')!;
const statusEl   = document.getElementById('status')!;

let selectedPlayer: PlayerIndex = 0;
btnP1.classList.add('pressed');

btnP1.addEventListener('click', () => { selectedPlayer = 0; btnP1.classList.add('pressed'); btnP2.classList.remove('pressed'); });
btnP2.addEventListener('click', () => { selectedPlayer = 1; btnP2.classList.add('pressed'); btnP1.classList.remove('pressed'); });

btnJoin.addEventListener('click', () => {
  const roomId = roomInput.value.trim().toUpperCase();
  if (!roomId) { setStatus('Ingresá un código de sala'); return; }
  console.log('[Controller] join_room', { roomId, selectedPlayer });
  setStatus('Conectando...');
  socket.connect();
  socket.emit('join_room', { roomId, playerIndex: selectedPlayer });
});

function setStatus(msg: string): void { statusEl.textContent = msg; }

function showController(): void {
  setupEl.style.display = 'none';
  controllerEl.style.display = 'flex';
}

// ─── Button → Command mapping ─────────────────────────────────────────────────
const buttonMap: Record<string, FighterCommand> = {
  dUp:         'JUMP',
  dLeft:       'MOVE_LEFT',
  dRight:      'MOVE_RIGHT',
  btnAttack:   'ATTACK',
  btnKick:     'KICK',
  btnBlock:    'BLOCK',
  btnFireball: 'FIREBALL',
};

for (const [id, cmd] of Object.entries(buttonMap)) {
  const el = document.getElementById(id)!;

  const press = (): void => {
    if (!pressed.has(cmd)) {
      console.log('[Controller] press', cmd);
    }
    pressed.add(cmd);
    el.classList.add('pressed');
  };

  const release = (): void => {
    if (pressed.has(cmd)) {
      console.log('[Controller] release', cmd);
    }
    pressed.delete(cmd);
    el.classList.remove('pressed');
  };

  el.addEventListener('touchstart', (e) => { e.preventDefault(); press(); }, { passive: false });
  el.addEventListener('touchend', (e) => { e.preventDefault(); release(); }, { passive: false });
  el.addEventListener('touchcancel', () => release());

  // Soporta pruebas desde navegador de escritorio (mouse/pointer) y mobile.
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
  el.addEventListener('pointerup', (e) => { e.preventDefault(); release(); });
  el.addEventListener('pointercancel', () => release());
  el.addEventListener('pointerleave', () => release());

  el.addEventListener('mousedown', (e) => { e.preventDefault(); press(); });
  el.addEventListener('mouseup', (e) => { e.preventDefault(); release(); });
  el.addEventListener('mouseleave', () => release());

}

// ─── Emit loop (60fps) ────────────────────────────────────────────────────────
function scheduleEmit(): void {
  function loop(): void {
    if (connected) {
      socket.emit('commands', [...pressed]);
      const now = Date.now();
      if (now - lastEmitLogAt > 1000) {
        console.log('[Controller] emit commands', [...pressed]);
        lastEmitLogAt = now;
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
}
