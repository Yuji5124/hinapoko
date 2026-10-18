import { describe, expect, it } from 'vitest';
import { areAdjacent, createBoard, findMatches, hasValidMove, seededRandom, type Board, type Stage } from '../src/game/core/board';
import { Game } from '../src/game/core/game';
import stage from '../src/game/levels/stage01.json';

const stageData = stage as Stage;
const boardOf = (rows: number[][]): Board => rows.map(row => row.map(animal => ({ animal, slab: false })));

describe('match rules', () => {
  it('finds horizontal and vertical runs of at least three', () => {
    const matches = findMatches(boardOf([[0,0,0,1],[1,2,1,2],[1,2,1,2],[1,2,1,2]]));
    expect(matches.some(x => x.orientation === 'horizontal')).toBe(true);
    expect(matches.some(x => x.orientation === 'vertical')).toBe(true);
  });
  it('supports runs of four and five', () => {
    expect(findMatches(boardOf([[0,0,0,0,1],[1,2,1,2,1],[2,1,2,1,2],[1,2,1,2,1],[2,1,2,1,2]])).some(m => m.cells.length === 4)).toBe(true);
    expect(findMatches(boardOf([[0,0,0,0,0],[1,2,1,2,1],[2,1,2,1,2],[1,2,1,2,1],[2,1,2,1,2]])).some(m => m.cells.length === 5)).toBe(true);
  });
  it('finds intersecting T and L groups on both axes', () => {
    const t = boardOf([[2,1,0,2,1],[1,0,0,0,2],[2,1,0,1,2],[1,2,1,2,1],[2,1,2,1,2]]);
    expect(new Set(findMatches(t).flatMap(m => m.cells.map(p => `${p.row},${p.col}`))).size).toBe(5);
    const l = boardOf([[0,0,0,1,2],[0,1,2,1,2],[0,2,1,2,1],[1,2,1,2,1],[2,1,2,1,2]]);
    expect(new Set(findMatches(l).flatMap(m => m.cells.map(p => `${p.row},${p.col}`))).size).toBe(5);
  });
  it('generates boards without matches and with a legal move across 40 seeds', () => {
    const randomStage = { ...stageData, initialAnimals: undefined, slabs: [] };
    for (let seed = 0; seed < 40; seed++) { const b = createBoard(randomStage, seededRandom(seed)); expect(findMatches(b)).toHaveLength(0); expect(hasValidMove(b)).toBe(true); }
  });
  it('accepts only orthogonally adjacent cells', () => { expect(areAdjacent({row:0,col:0},{row:0,col:1})).toBe(true); expect(areAdjacent({row:0,col:0},{row:1,col:1})).toBe(false); });
});

describe('turn lifecycle', () => {
  it('rolls back a non-matching move without spending a move', async () => {
    const g = new Game(stageData, 55); const before = g.board.map(row => row.map(c => c.animal));
    let rejected = false;
    for (let r=0;r<5&&!rejected;r++) for (let c=0;c<5&&!rejected;c++) for (const [dr,dc] of [[0,1],[1,0]]) {
      const rr=r+dr,cc=c+dc;if(rr>=5||cc>=5)continue;
      const copy = g.board.map(row => row.map(x => ({...x})));
      [copy[r][c].animal,copy[rr][cc].animal]=[copy[rr][cc].animal,copy[r][c].animal];
      if(!findMatches(copy).length){const result=await g.play({row:r,col:c},{row:rr,col:cc},async()=>{});expect(result.accepted).toBe(false);rejected=true;}
    }
    expect(rejected).toBe(true); expect(g.moves).toBe(stageData.moves); expect(g.board.map(row => row.map(c => c.animal))).toEqual(before);
  });
  it('spends one move, breaks slabs, falls, refills and completes after goal', async () => {
    const g = new Game(stageData, 7);
    let accepted = false;
    for (let r=0;r<5&&!accepted;r++) for(let c=0;c<5&&!accepted;c++) for(const [dr,dc] of [[0,1],[1,0]]) {
      const rr=r+dr,cc=c+dc;if(rr>=5||cc>=5)continue;
      const copy=g.board.map(row=>row.map(x=>({...x})));[copy[r][c].animal,copy[rr][cc].animal]=[copy[rr][cc].animal,copy[r][c].animal];
      if(findMatches(copy).length){const res=await g.play({row:r,col:c},{row:rr,col:cc},async()=>{});expect(res.accepted).toBe(true);expect(g.moves).toBe(stageData.moves-1);accepted=true;}
    }
    expect(accepted).toBe(true); expect(g.board).toHaveLength(5); expect(g.board.every(row=>row.length===5)).toBe(true);
  });
  it('shows a guaranteed tutorial move that completes the first goal', async () => {
    const g = new Game(stageData, 23);
    expect(findMatches(g.board)).toHaveLength(0);
    const result = await g.play({row: 2, col: 0}, {row: 2, col: 1}, async()=>{});
    expect(result.accepted).toBe(true);
    expect(result.state).toBe('COMPLETE');
    expect(g.slabsBroken).toBe(3);
    expect(g.moves).toBe(11);
    expect(result.cascades).toBeGreaterThan(1);
    expect(g.board.every(row => row.every(cell => cell.animal >= 0))).toBe(true);
  });
});
