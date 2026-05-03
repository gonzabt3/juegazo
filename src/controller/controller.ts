import { io } from 'socket.io-client';

type FighterCommand = 'MOVE_LEFT' | 'MOVE_RIGHT' | 'JUMP' | 'ATTACK' | 'BLOCK' | 'FIREBALL' | 'KICK';
type PlayerIndex = 0 | 1;

// ─── State ───────────────────────────────────────────────────────────────────
const pressed = new Set<FighterCommand>();
let connected = false;
let dataChannel: RTCDataChannel | null = null;

const STUN = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// ─── Socket ───────────────────────────────────────────────────────────────────
const SERVER_URL = import.meta.env.VITE_SERVER_URL as string;
const socket = io(SERVER_URL, {
  autoConnect: false,
  transports: ['websocket'],
});
let lastSentKey = '';
let lastSentAt = 0;
const KEEPALIVE_MS = 120;

socket.on('joined', ({ playerIndex: pi }: { playerIndex: PlayerIndex }) => {
  setStatus(`Conectado como P${pi + 1} ✔`);
  showController();
  connected = true;
  setupWebRTC(pi);
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
    pressed.add(cmd);
    el.classList.add('pressed');
  };

  const release = (): void => {
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

// ─── WebRTC setup ─────────────────────────────────────────────────────────────
function setupWebRTC(playerIndex: PlayerIndex): void {
  const pc = new RTCPeerConnection(STUN);

  // DataChannel: unordered + sin retransmisiones = latencia mínima (tipo UDP)
  const dc = pc.createDataChannel('commands', { ordered: false, maxRetransmits: 0 });
  dc.onopen    = () => { dataChannel = dc; };
  dc.onclose   = () => { dataChannel = null; };
  dc.onerror   = () => { dataChannel = null; };

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('rtc_ice', { playerIndex, candidate: e.candidate.toJSON() });
  };

  socket.on('rtc_answer', ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
    pc.setRemoteDescription(new RTCSessionDescription(sdp));
  });

  socket.on('rtc_ice', ({ candidate }: { candidate: RTCIceCandidateInit }) => {
    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {/* ignorar */});
  });

  pc.createOffer()
    .then(offer => { pc.setLocalDescription(offer); socket.emit('rtc_offer', { playerIndex, sdp: offer }); })
    .catch(() => {/* fallback a socket */});
}

// ─── Emit loop (60fps) ────────────────────────────────────────────────────────
function scheduleEmit(): void {
  function loop(): void {
    if (connected) {
      const commands = [...pressed].sort();
      const key = commands.join('|');
      const now = performance.now();
      const shouldSend = key !== lastSentKey || now - lastSentAt >= KEEPALIVE_MS;

      if (shouldSend) {
        const payload = JSON.stringify(commands);
        if (dataChannel?.readyState === 'open') {
          dataChannel.send(payload);           // directo P2P, sin pasar por Render
        } else {
          socket.volatile.emit('commands', commands); // fallback a socket
        }
        lastSentKey = key;
        lastSentAt = now;
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
}
