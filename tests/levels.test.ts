import { describe, expect, it } from 'vitest';
import { findMatches, seededRandom, swapAnimals, type Position, type Stage } from '../src/game/core/board';
import { Game } from '../src/game/core/game';
import level01 from '../src/game/levels/stage01.json';
import level02 from '../src/game/levels/stage02.json';
import level03 from '../src/game/levels/stage03.json';
import level04 from '../src/game/levels/stage04.json';
import level05 from '../src/game/levels/stage05.json';
import level06 from '../src/game/levels/stage06.json';
import level07 from '../src/game/levels/stage07.json';
import level08 from '../src/game/levels/stage08.json';
import level09 from '../src/game/levels/stage09.json';
import level10 from '../src/game/levels/stage10.json';

function legalMoves(game: Game): [Position, Position][] {
  const moves: [Position, Position][] = [];
  for (let row=0;row<game.stage.rows;row++) for(let col=0;col<game.stage.columns;col++) for(const [dr,dc] of [[0,1],[1,0]]) {
    const next={row:row+dr,col:col+dc};
    if(next.row>=game.stage.rows||next.col>=game.stage.columns||game.board[row][col].hole||game.board[next.row][next.col].hole)continue;
    const board=game.board.map(line=>line.map(cell=>({...cell}))), here={row,col};
    const hasBomb=Boolean(board[row][col].bomb||board[next.row][next.col].bomb);
    swapAnimals(board,here,next);
    if(hasBomb||findMatches(board).length)moves.push([here,next]);
  }
  return moves;
}

describe('level playability exploration', () => {
  it('can reach the goal across multiple deterministic refill seeds', async () => {
    const levels=[level01,level02,level03,level04,level05,level06,level07,level08,level09,level10] as Stage[];
    const summary: Record<number,number> = {};
    for(const level of levels) {
      let wins=0;
      for(let seed=0;seed<20;seed++) {
        const game=new Game(level,seed+1), random=seededRandom(seed+7800);
        while(game.state==='IDLE') {
          const moves=legalMoves(game);
          if(!moves.length)break;
          const [a,b]=moves[Math.floor(random()*moves.length)];
          const result=await game.play(a,b,async()=>{});
          if(result.state==='COMPLETE'){wins++;break;}
          if(result.state==='FAILED')break;
        }
      }
      summary[level.id]=wins;
      expect(wins, `stage ${level.id} had no wins in 20 seeded playthroughs`).toBeGreaterThan(0);
    }
    console.info('wins per 20 seeded playthroughs:', summary);
  }, 30_000);
});
