import { areAdjacent, createBoard, findMatches, hasValidMove, specialForMatches, swapAnimals, type Board, type BombType, type Position, type Stage } from './board';

export type GameState = 'IDLE' | 'SWAPPING' | 'MATCHING' | 'FALLING' | 'REFILLING' | 'COMPLETE' | 'FAILED';
export type TurnResult = { accepted: boolean; cascades: number; state: GameState; bombsGenerated: BombType[] };

export class Game {
  board: Board;
  moves: number;
  animalsCleared = 0;
  cascadeNumber = 0;
  readonly refilledCells = new Set<string>();
  state: GameState = 'IDLE';
  private random: () => number;
  constructor(readonly stage: Stage, seed = Date.now()) { this.random = createSeed(seed); this.board = createBoard(stage, this.random); this.moves = stage.moves; }

  async play(a: Position, b: Position, pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))): Promise<TurnResult> {
    if (this.state !== 'IDLE' || !areAdjacent(a, b) || !this.inBounds(a) || !this.inBounds(b) || this.board[a.row][a.col].hole || this.board[b.row][b.col].hole) return { accepted: false, cascades: 0, state: this.state, bombsGenerated: [] };
    this.state = 'SWAPPING';
    const activatedBombs = Boolean(this.board[a.row][a.col].bomb || this.board[b.row][b.col].bomb);
    swapAnimals(this.board, a, b);
    await pause(140);
    const matches = findMatches(this.board);
    if (!matches.length && !activatedBombs) { swapAnimals(this.board, a, b); await pause(130); this.state = 'IDLE'; return { accepted: false, cascades: 0, state: this.state, bombsGenerated: [] }; }

    this.moves--;
    let cascades = 0;
    const bombsGenerated: BombType[] = [];
    let isFirstPass = true;
    while ((findMatches(this.board).length || (isFirstPass && activatedBombs)) && cascades < 30) {
      this.cascadeNumber = cascades;
      this.refilledCells.clear();
      this.state = 'MATCHING'; await pause(170);
      const currentMatches = findMatches(this.board);
      const clear = new Set(currentMatches.flatMap(m => m.cells.map(p => key(p.row, p.col))));
      const newBomb = isFirstPass && activatedBombs ? null : specialForMatches(currentMatches);
      const bombAnchor = newBomb && isFirstPass && currentMatches.some(m => m.cells.some(p => p.row === b.row && p.col === b.col)) ? b :
        newBomb && isFirstPass && currentMatches.some(m => m.cells.some(p => p.row === a.row && p.col === a.col)) ? a : currentMatches[0]?.cells[0];
      const createsBomb = Boolean(newBomb && bombAnchor && clear.has(key(bombAnchor.row, bombAnchor.col)));
      if (createsBomb && bombAnchor) clear.delete(key(bombAnchor.row, bombAnchor.col));
      if (isFirstPass && activatedBombs) { clear.add(key(a.row, a.col)); clear.add(key(b.row, b.col)); }
      this.expandBombEffects(clear, isFirstPass && activatedBombs ? [a, b] : []);
      for (const id of clear) {
        const [r, c] = parseKey(id), cell = this.board[r][c];
        if (!(createsBomb && bombAnchor && r === bombAnchor.row && c === bombAnchor.col)) {
          if (cell.animal >= 0) this.animalsCleared++;
          cell.animal = -1;
        }
      }
      if (createsBomb && newBomb && bombAnchor) { this.board[bombAnchor.row][bombAnchor.col].bomb = newBomb; bombsGenerated.push(newBomb); }
      cascades++;
      isFirstPass = false;
      this.state = 'FALLING'; await pause(140);
      for (let c = 0; c < this.stage.columns; c++) {
        let bottom = this.stage.rows - 1;
        while (bottom >= 0) {
          if (this.board[bottom][c].hole) { bottom--; continue; }
          let top = bottom;
          while (top >= 0 && !this.board[top][c].hole) top--;
          top++;
          const survivors = this.board.slice(top, bottom + 1).map(row => row[c]).filter(cell => cell.animal >= 0);
          const missing = bottom - top + 1 - survivors.length;
          for (let r = top; r < top + missing; r++) this.refilledCells.add(key(r, c));
          const next = [...Array.from({ length: missing }, () => ({ animal: Math.floor(this.random() * this.stage.animalKinds) })), ...survivors];
          for (let r = top; r <= bottom; r++) this.board[r][c] = next[r - top];
          bottom = top - 1;
        }
      }
      this.state = 'REFILLING'; await pause(120);
    }
    this.state = this.goalReached() ? 'COMPLETE' : this.moves <= 0 ? 'FAILED' : 'IDLE';
    if (this.state === 'IDLE' && !hasValidMove(this.board)) this.board = this.shuffleBoard();
    return { accepted: true, cascades, state: this.state, bombsGenerated };
  }

  private goalReached(): boolean {
    return this.animalsCleared >= this.stage.animalGoal;
  }

  private expandBombEffects(clear: Set<string>, directlyActivated: Position[]): void {
    const activated = new Set<string>();
    const queue = [...directlyActivated.map(p => key(p.row, p.col)), ...clear];
    while (queue.length) {
      const id = queue.pop()!;
      if (activated.has(id)) continue;
      const [r, c] = parseKey(id), cell = this.board[r]?.[c];
      if (!cell?.bomb) continue;
      activated.add(id);
      const add = (row: number, col: number) => {
        if (row < 0 || row >= this.stage.rows || col < 0 || col >= this.stage.columns || this.board[row][col].hole) return;
        const next = key(row, col);
        if (!clear.has(next)) { clear.add(next); queue.push(next); }
      };
      if (cell.bomb === 'arrow-row') for (let col = 0; col < this.stage.columns; col++) add(r, col);
      else if (cell.bomb === 'arrow-column') for (let row = 0; row < this.stage.rows; row++) add(row, c);
      else if (cell.bomb === 'double') {
        for (let radius = 1; radius <= 2; radius++) for (let row = r - radius; row <= r + radius; row++) for (let col = c - radius; col <= c + radius; col++) if (Math.max(Math.abs(row-r), Math.abs(col-c)) === radius) add(row, col);
      } else {
        const partner = directlyActivated.find(p => p.row !== r || p.col !== c);
        const targetAnimal = partner ? this.board[partner.row][partner.col].animal : cell.animal;
        if (directlyActivated.some(p => p.row !== r || p.col !== c) && this.board[partner!.row][partner!.col].bomb === 'rainbow') {
          for (let row = 0; row < this.stage.rows; row++) for (let col = 0; col < this.stage.columns; col++) add(row, col);
        } else {
          for (let row = 0; row < this.stage.rows; row++) for (let col = 0; col < this.stage.columns; col++) if (this.board[row][col].animal === targetAnimal) add(row, col);
        }
      }
    }
  }

  private inBounds(p: Position): boolean { return p.row >= 0 && p.row < this.stage.rows && p.col >= 0 && p.col < this.stage.columns; }
  private shuffleBoard(): Board {
    return createBoard({ ...this.stage, initialAnimals: undefined }, this.random);
  }
}

function key(row: number, col: number): string { return `${row},${col}`; }
function parseKey(id: string): [number, number] { return id.split(',').map(Number) as [number, number]; }
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
