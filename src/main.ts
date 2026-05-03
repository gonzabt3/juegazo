import './style.css';
import { Game } from './game';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const game = new Game(canvas);
game.start();
