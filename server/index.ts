import { createServer } from 'http';
import { Server } from 'socket.io';

const PORT = process.env.PORT ?? 3000;

const http = createServer();
const io = new Server(http, {
  cors: { origin: '*' },
});

type PlayerIndex = 0 | 1;
type FighterCommand = 'MOVE_LEFT' | 'MOVE_RIGHT' | 'JUMP' | 'ATTACK' | 'BLOCK' | 'FIREBALL' | 'KICK';

interface Room {
  displayId: string | null;
  controllers: Map<PlayerIndex, string>;
}

const rooms = new Map<string, Room>();

function makeRoomId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('create_room', () => {
    const roomId = makeRoomId();
    rooms.set(roomId, { displayId: socket.id, controllers: new Map() });
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.isDisplay = true;
    socket.emit('room_created', { roomId });
    console.log(`[room] created ${roomId}`);
  });

  socket.on('join_room', (data: { roomId: string; playerIndex: PlayerIndex }) => {
    const room = rooms.get(data.roomId);
    if (!room) { socket.emit('join_error', 'Sala no encontrada'); return; }
    if (room.controllers.has(data.playerIndex)) { socket.emit('join_error', 'Jugador ya ocupado'); return; }

    room.controllers.set(data.playerIndex, socket.id);
    socket.join(data.roomId);
    socket.data.roomId = data.roomId;
    socket.data.playerIndex = data.playerIndex;
    socket.data.isDisplay = false;

    socket.emit('joined', { playerIndex: data.playerIndex });
    io.to(data.roomId).emit('player_connected', { playerIndex: data.playerIndex });
    console.log(`[room] ${data.roomId} P${data.playerIndex + 1} joined`);
  });

  socket.on('commands', (commands: FighterCommand[]) => {
    const { roomId, playerIndex } = socket.data as { roomId: string; playerIndex: PlayerIndex };
    if (!roomId) return;
    io.to(roomId).volatile.emit('commands', { playerIndex, commands });
  });

  socket.on('player_hit', (data: { playerIndex: PlayerIndex }) => {
    const { roomId } = socket.data as { roomId: string };
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const controllerId = room.controllers.get(data.playerIndex);
    if (controllerId) io.to(controllerId).emit('vibrate');
  });

  socket.on('disconnect', () => {
    const { roomId, playerIndex, isDisplay } = socket.data as {
      roomId?: string;
      playerIndex?: PlayerIndex;
      isDisplay?: boolean;
    };
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    if (isDisplay) {
      rooms.delete(roomId);
      io.to(roomId).emit('room_closed');
      console.log(`[room] ${roomId} closed (display left)`);
    } else if (playerIndex !== undefined) {
      room.controllers.delete(playerIndex);
      io.to(roomId).emit('player_disconnected', { playerIndex });
      console.log(`[room] ${roomId} P${playerIndex + 1} disconnected`);
    }
  });
});

http.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
