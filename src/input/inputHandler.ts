import type { Controls } from '../types';
import type { FighterCommand } from './commands';

export class InputHandler {
  getCommands(pressedKeys: Set<string>, controls: Controls): FighterCommand[] {
    const commands: FighterCommand[] = [];
    if (pressedKeys.has(controls.left))   commands.push('MOVE_LEFT');
    if (pressedKeys.has(controls.right))  commands.push('MOVE_RIGHT');
    if (pressedKeys.has(controls.jump))   commands.push('JUMP');
    if (pressedKeys.has(controls.attack)) commands.push('ATTACK');
    if (pressedKeys.has(controls.block))    commands.push('BLOCK');
    if (pressedKeys.has(controls.fireball)) commands.push('FIREBALL');
    if (pressedKeys.has(controls.kick))     commands.push('KICK');
    return commands;
  }
}
