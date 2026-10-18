export type Cell = { animal: number; slab: boolean; bomb?: BombType; hole?: boolean };
export type Position = { row: number; col: number };
export type Board = Cell[][];
export type Match = { cells: Position[]; orientation: 'horizontal' | 'vertical' };
export type BombType = 'arrow-row' | 'arrow-column' | 'double' | 'rainbow';
export type Stage = { id: number; rows: number; columns: number; animalKinds: number; moves: number; slabGoal: number; slabs: number[][]; holes?: number[][]; tutorialSwap?: number[][]; initialAnimals?: number[][] };

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
}

export function findMatches(board: Board): Match[] {
  const found = new Map<string, Match>();
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  for (let r = 0; r < rows; r++) {
    let start = 0;
    while (start < cols) {
      const first = board[r][start];
      const kind = first && !first.hole && first.animal >= 0 ? first.animal : undefined;
      let end = start + 1;
      while (kind !== undefined && end < cols && !board[r][end].hole && board[r][end].animal === kind) end++;
      if (kind !== undefined && end - start >= 3) {
        const cells = Array.from({ length: end - start }, (_, i) => ({ row: r, col: start + i }));
        found.set(cells.map(c => `${c.row},${c.col}`).join('|'), { cells, orientation: 'horizontal' });
      }
      start = end;
    }
  }
  for (let c = 0; c < cols; c++) {
    let start = 0;
    while (start < rows) {
      const first = board[start][c];
      const kind = first && !first.hole && first.animal >= 0 ? first.animal : undefined;
      let end = start + 1;
      while (kind !== undefined && end < rows && !board[end][c].hole && board[end][c].animal === kind) end++;
      if (kind !== undefined && end - start >= 3) {
        const cells = Array.from({ length: end - start }, (_, i) => ({ row: start + i, col: c }));
        found.set(cells.map(p => `${p.row},${p.col}`).join('|'), { cells, orientation: 'vertical' });
      }
      start = end;
    }
  }
  return [...found.values()];
}

export function specialForMatches(matches: Match[]): BombType | null {
  if (matches.some(match => match.cells.length >= 5)) return 'rainbow';
  const horizontal = matches.filter(match => match.orientation === 'horizontal');
  const vertical = matches.filter(match => match.orientation === 'vertical');
  if (horizontal.some(h => vertical.some(v => h.cells.some(a => v.cells.some(b => a.row === b.row && a.col === b.col))))) return 'double';
  if (matches.some(match => match.cells.length >= 4)) return matches.find(match => match.cells.length >= 4)?.orientation === 'horizontal' ? 'arrow-row' : 'arrow-column';
  return null;
}

function hasMatchAt(board: Board, row: number, col: number): boolean {
  const cell = board[row][col];
  if (cell.hole || cell.animal < 0) return false;
  const k = cell.animal;
  let count = 1;
  for (let c = col - 1; c >= 0 && !board[row][c].hole && board[row][c].animal === k; c--) count++;
  for (let c = col + 1; c < board[0].length && !board[row][c].hole && board[row][c].animal === k; c++) count++;
  if (count >= 3) return true;
  count = 1;
  for (let r = row - 1; r >= 0 && !board[r][col].hole && board[r][col].animal === k; r--) count++;
  for (let r = row + 1; r < board.length && !board[r][col].hole && board[r][col].animal === k; r++) count++;
  return count >= 3;
}

export function hasValidMove(board: Board): boolean {
  for (let r = 0; r < board.length; r++) for (let c = 0; c < board[0].length; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= board.length || nc >= board[0].length || board[r][c].hole || board[nr][nc].hole) continue;
      [board[r][c].animal, board[nr][nc].animal] = [board[nr][nc].animal, board[r][c].animal];
      const valid = Boolean(board[r][c].bomb || board[nr][nc].bomb || hasMatchAt(board, r, c) || hasMatchAt(board, nr, nc));
      [board[r][c].animal, board[nr][nc].animal] = [board[nr][nc].animal, board[r][c].animal];
      if (valid) return true;
    }
  }
  return false;
}

export function createBoard(stage: Stage, random: () => number): Board {
  const slabCells = new Set(stage.slabs.map(([r, c]) => `${r},${c}`));
  const holeCells = new Set((stage.holes ?? []).map(([r, c]) => `${r},${c}`));
  if (stage.initialAnimals) {
    const board = stage.initialAnimals.map((row, r) => row.map((animal, c) => holeCells.has(`${r},${c}`) ? ({ animal: -1, slab: false, hole: true }) : ({ animal, slab: slabCells.has(`${r},${c}`) })));
    if (board.length !== stage.rows || board.some(row => row.length !== stage.columns) || findMatches(board).length || !hasValidMove(board)) throw new Error('ステージの初期盤面が不正です');
    return board;
  }
  for (let attempt = 0; attempt < 500; attempt++) {
    const board: Board = [];
    for (let r = 0; r < stage.rows; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < stage.columns; c++) {
        if (holeCells.has(`${r},${c}`)) { row.push({ animal: -1, slab: false, hole: true }); continue; }
        let animal = Math.floor(random() * stage.animalKinds);
        let guard = 0;
        while (guard++ < 20 && ((c >= 2 && !row[c - 1].hole && !row[c - 2].hole && row[c - 1].animal === animal && row[c - 2].animal === animal) || (r >= 2 && !board[r - 1][c].hole && !board[r - 2][c].hole && board[r - 1][c].animal === animal && board[r - 2][c].animal === animal))) animal = Math.floor(random() * stage.animalKinds);
        row.push({ animal, slab: slabCells.has(`${r},${c}`), bomb: undefined });
      }
      board.push(row);
    }
    if (!findMatches(board).length && hasValidMove(board)) return board;
  }
  throw new Error('盤面を作れませんでした');
}

export function cloneBoard(board: Board): Board { return board.map(row => row.map(cell => ({ ...cell }))); }
export function areAdjacent(a: Position, b: Position): boolean { return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1; }
export function swapAnimals(board: Board, a: Position, b: Position): void {
  [board[a.row][a.col].animal, board[b.row][b.col].animal] = [board[b.row][b.col].animal, board[a.row][a.col].animal];
  [board[a.row][a.col].bomb, board[b.row][b.col].bomb] = [board[b.row][b.col].bomb, board[a.row][a.col].bomb];
}
