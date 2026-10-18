import { describe, expect, it } from 'vitest';
import { areAdjacent, createBoard, findMatches, hasValidMove, seededRandom, specialForMatches, type Board, type Stage } from '../src/game/core/board';
import { Game, saveStage, savedStage } from '../src/game/core/game';
import stage from '../src/game/levels/stage01.json';
import stage02 from '../src/game/levels/stage02.json';
import stage03 from '../src/game/levels/stage03.json';
import stage04 from '../src/game/levels/stage04.json';
import stage05 from '../src/game/levels/stage05.json';
import stage06 from '../src/game/levels/stage06.json';
import stage07 from '../src/game/levels/stage07.json';
import stage08 from '../src/game/levels/stage08.json';
import stage09 from '../src/game/levels/stage09.json';
import stage10 from '../src/game/levels/stage10.json';

const stageData = stage as Stage;
const boardOf = (rows: number[][]): Board => rows.map(row => row.map(animal => ({ animal, slab: false })));

describe('match rules', () => {
  it('finds horizontal and vertical runs of at least three', () => {
    const matches = findMatches(boardOf([[0,0,0,1],[1,2,1,2],[1,2,1,2],[1,2,1,2]]));
    expect(matches.some(x => x.orientation === 'horizontal')).toBe(true);
    expect(matches.some(x => x.orientation === 'vertical')).toBe(true);
  });
  it('supports runs of four and five', () => {
    const four = findMatches(boardOf([[0,0,0,0,1],[1,2,1,2,1],[2,1,2,1,2],[1,2,1,2,1],[2,1,2,1,2]]));
    const five = findMatches(boardOf([[0,0,0,0,0],[1,2,1,2,1],[2,1,2,1,2],[1,2,1,2,1],[2,1,2,1,2]]));
    expect(four.some(m => m.cells.length === 4)).toBe(true); expect(specialForMatches(four)).toBe('arrow-row');
    expect(five.some(m => m.cells.length === 5)).toBe(true); expect(specialForMatches(five)).toBe('rainbow');
  });
  it('finds intersecting T and L groups on both axes', () => {
    const t = boardOf([[2,1,0,2,1],[1,0,0,0,2],[2,1,0,1,2],[1,2,1,2,1],[2,1,2,1,2]]);
    expect(new Set(findMatches(t).flatMap(m => m.cells.map(p => `${p.row},${p.col}`))).size).toBe(5);
    expect(specialForMatches(findMatches(t))).toBe('double');
    const l = boardOf([[0,0,0,1,2],[0,1,2,1,2],[0,2,1,2,1],[1,2,1,2,1],[2,1,2,1,2]]);
    expect(new Set(findMatches(l).flatMap(m => m.cells.map(p => `${p.row},${p.col}`))).size).toBe(5);
  });
  it('generates boards without matches and with a legal move across 40 seeds', () => {
    const randomStage = { ...stageData, initialAnimals: undefined, slabs: [] };
    for (let seed = 0; seed < 40; seed++) { const b = createBoard(randomStage, seededRandom(seed)); expect(findMatches(b)).toHaveLength(0); expect(hasValidMove(b)).toBe(true); }
  });
  it('keeps each of the ten level layouts playable and match-free across fixed seeds', () => {
    for (const level of [stageData,stage02,stage03,stage04,stage05,stage06,stage07,stage08,stage09,stage10] as Stage[]) {
      for (let seed=0;seed<10;seed++) { const b=createBoard(level,seededRandom(seed)); expect(findMatches(b)).toHaveLength(0); expect(hasValidMove(b)).toBe(true); }
    }
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
  it('counts collected animals toward an animal target instead of slab tiles', async () => {
    const targetStage = { ...stageData, slabGoal: 0, targetAnimals: { animal: 0, count: 3 } };
    const g = new Game(targetStage, 23);
    const result = await g.play({ row: 2, col: 0 }, { row: 2, col: 1 }, async()=>{});
    expect(g.targetAnimalsCleared).toBeGreaterThanOrEqual(3);
    expect(result.state).toBe('COMPLETE');
  });
  it('activates an arrow bomb across its row', async () => {
    const g = new Game(stageData, 31); g.board[0][0].bomb = 'arrow-row';
    const result = await g.play({row:0,col:0},{row:0,col:1},async()=>{});
    expect(result.accepted).toBe(true); expect(result.cascades).toBeGreaterThan(0);
    expect(g.board.flat().some(cell => cell.bomb === 'arrow-row')).toBe(false);
  });
  it('clears through a hole without moving the hole cell', async () => {
    const level = stage09 as Stage, g = new Game(level, 18);
    expect((await g.play({row:3,col:3},{row:3,col:4},async()=>{})).accepted).toBe(false);
    let moved = false;
    for(let r=0;r<7&&!moved;r++) for(let c=0;c<7&&!moved;c++) for(const [dr,dc] of [[0,1],[1,0]]) {
      const rr=r+dr,cc=c+dc;if(rr>=7||cc>=7||g.board[r][c].hole||g.board[rr][cc].hole)continue;
      const copy=g.board.map(row=>row.map(cell=>({...cell})));[copy[r][c].animal,copy[rr][cc].animal]=[copy[rr][cc].animal,copy[r][c].animal];
      if(findMatches(copy).length){await g.play({row:r,col:c},{row:rr,col:cc},async()=>{});moved=true;}
    }
    expect(moved).toBe(true); expect(g.board[3][3].hole).toBe(true); expect(g.board.flat().filter(c=>!c.hole).every(c=>c.animal>=0)).toBe(true);
  });
  it('generates each special bomb type from seeded cascades', async () => {
    const generated=new Set<string>();
    for(let seed=0;seed<1500&&generated.size<4;seed++) {
      const g=new Game(stageData,seed), result=await g.play({row:2,col:0},{row:2,col:1},async()=>{});
      result.bombsGenerated.forEach(bomb=>generated.add(bomb));
    }
    expect([...generated].sort()).toEqual(['arrow-column','arrow-row','double','rainbow']);
  });
  it('chains double and rainbow bomb effects and counts each slab once', async () => {
    const double=new Game(stageData,42); double.board[2][2].bomb='double';
    const d=await double.play({row:2,col:2},{row:2,col:3},async()=>{});
    expect(d.state).toBe('COMPLETE'); expect(d.clearedSlabs).toBe(3);
    const rainbow=new Game(stageData,43); rainbow.board[0][0].bomb='rainbow'; rainbow.board[0][1].bomb='rainbow';
    const r=await rainbow.play({row:0,col:0},{row:0,col:1},async()=>{});
    expect(r.state).toBe('COMPLETE'); expect(r.clearedSlabs).toBe(3);
  });
  it('fails at zero moves when the slab goal is still unmet', async () => {
    const g = new Game({ ...stageData, moves: 1, slabGoal: 99 }, 32);
    const result = await g.play({row:2,col:0},{row:2,col:1},async()=>{});
    expect(result.state).toBe('FAILED'); expect(g.moves).toBe(0);
  });
});

describe('progress storage', () => {
  it('loads saved progress and only advances it', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map<string,string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => values.set(key,value) } });
    try { expect(savedStage()).toBe(1); saveStage(4); expect(savedStage()).toBe(4); saveStage(2); expect(savedStage()).toBe(4); }
    finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete (globalThis as { localStorage?: Storage }).localStorage; }
  });
});
