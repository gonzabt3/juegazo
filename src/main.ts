import './style.css';
import { Game } from './game';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const game = new Game(canvas);
game.start();

if (import.meta.env.VITE_CONNECTION_MODE === 'local' || !import.meta.env.DEV) {
  game.connectToServer();
}

