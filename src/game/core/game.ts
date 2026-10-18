import { areAdjacent, cloneBoard, createBoard, findMatches, hasValidMove, swapAnimals, type Board, type Position, type Stage } from './board';

export type GameState = 'IDLE' | 'SWAPPING' | 'MATCHING' | 'FALLING' | 'REFILLING' | 'COMPLETE' | 'FAILED';
export type TurnResult = { accepted: boolean; cascades: number; clearedSlabs: number; state: GameState };

export class Game {
  board: Board;
  moves: number;
  slabsBroken = 0;
  state: GameState = 'IDLE';
  private random: () => number;
  constructor(readonly stage: Stage, seed = Date.now()) { this.random = createSeed(seed); this.board = createBoard(stage, this.random); this.moves = stage.moves; }

  async play(a: Position, b: Position, pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<TurnResult> {
    if (this.state !== 'IDLE' || !areAdjacent(a, b) || !this.inBounds(a) || !this.inBounds(b)) return { accepted: false, cascades: 0, clearedSlabs: 0, state: this.state };
    this.state = 'SWAPPING'; swapAnimals(this.board, a, b);
    if (!findMatches(this.board).length) { swapAnimals(this.board, a, b); this.state = 'IDLE'; return { accepted: false, cascades: 0, clearedSlabs: 0, state: this.state }; }
    this.moves--; let cascades = 0, clearedSlabs = 0;
    while (findMatches(this.board).length && cascades < 30) {
      this.state = 'MATCHING'; await pause(170);
      const cells = new Set(findMatches(this.board).flatMap(m => m.cells.map(p => `${p.row},${p.col}`)));
      for (const key of cells) {
        const [r, c] = key.split(',').map(Number);
        if (this.board[r][c].slab) { this.board[r][c].slab = false; clearedSlabs++; }
      }
      for (const key of cells) { const [r, c] = key.split(',').map(Number); this.board[r][c].animal = -1; }
      cascades++;
      this.state = 'FALLING'; await pause(140);
      for (let c = 0; c < this.stage.columns; c++) {
        const survivors = this.board.map(row => row[c]).filter(cell => cell.animal >= 0);
        const missing = this.stage.rows - survivors.length;
        const next = [...Array.from({ length: missing }, () => ({ animal: Math.floor(this.random() * this.stage.animalKinds), slab: false })), ...survivors];
        for (let r = 0; r < this.stage.rows; r++) this.board[r][c] = next[r];
      }
      this.state = 'REFILLING'; await pause(120);
    }
    this.slabsBroken += clearedSlabs;
    this.state = this.slabsBroken >= this.stage.slabGoal ? 'COMPLETE' : this.moves <= 0 ? 'FAILED' : 'IDLE';
    if (this.state === 'IDLE' && !hasValidMove(this.board)) this.board = this.shuffleBoard();
    return { accepted: true, cascades, clearedSlabs, state: this.state };
  }
  private inBounds(p: Position): boolean { return p.row >= 0 && p.row < this.stage.rows && p.col >= 0 && p.col < this.stage.columns; }
  private shuffleBoard(): Board {
    const slabs: number[][] = [];
    for (let r = 0; r < this.board.length; r++) for (let c = 0; c < this.board[r].length; c++) if (this.board[r][c].slab) slabs.push([r, c]);
    return createBoard({ ...this.stage, slabs, initialAnimals: undefined }, this.random);
  }
}

function createSeed(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
}

export function savedStage(): number {
  try { return Math.max(1, Number(localStorage.getItem('hinapoko-stage') || 1)); } catch { return 1; }
}
export function saveStage(stage: number): void {
  try { const current = savedStage(); if (stage > current) localStorage.setItem('hinapoko-stage', String(stage)); } catch { /* private browsing may disable storage */ }
}
export { cloneBoard };
