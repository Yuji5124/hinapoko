import Phaser from 'phaser';
import stage01 from './game/levels/stage01.json';
import { Game, saveStage } from './game/core/game';
import { findMatches, type Position } from './game/core/board';
import './style.css';

const animals = ['🐤', '🐰', '🐻', '🐱', '🐶'];
const palette = [0xffdf68, 0xffb2ce, 0xc8885a, 0x79c5ff, 0xff9c68];

class PlayScene extends Phaser.Scene {
  private engine!: Game;
  private selected: Position | null = null;
  private busy = false;
  private hint: [Position, Position] | null = null;
  private lastAction = 0;
  private soundEnabled = true;
  private cellSize = 68;
  private boardX = 0;
  private boardY = 0;
  private touchStart: { x: number; y: number; time: number } | null = null;
  private touchPointerId: number | null = null;
  private message = 'どうぶつを うごかそう！';
  private completed = false;
  private sounds!: { context: AudioContext | null; play: (frequency: number) => void };

  constructor() { super('play'); }
  create(): void {
    this.engine = new Game(stage01, Number(new URLSearchParams(location.search).get('seed') || 20251018));
    if (stage01.tutorialSwap) {
      this.hint = stage01.tutorialSwap.map(([row, col]) => ({ row, col })) as [Position, Position];
      this.message = 'ひかる どうぶつを うごかそう！';
    }
    this.sounds = { context: null, play: (frequency) => {
      if (!this.sound) return;
      try {
        const AudioCtx = window.AudioContext;
        this.sounds.context ??= new AudioCtx();
        if (this.sounds.context.state === 'suspended') void this.sounds.context.resume();
        const oscillator = this.sounds.context.createOscillator(), gain = this.sounds.context.createGain();
        oscillator.frequency.value = frequency; oscillator.type = 'sine'; gain.gain.setValueAtTime(0.11, this.sounds.context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, this.sounds.context.currentTime + 0.16);
        oscillator.connect(gain); gain.connect(this.sounds.context.destination); oscillator.start(); oscillator.stop(this.sounds.context.currentTime + 0.17);
      } catch { /* audio is optional */ }
    }};
    this.layout();
    this.scale.on('resize', () => this.layout());
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.touchStart) return;
      this.touchPointerId = pointer.id;
      this.touchStart = { x: pointer.x, y: pointer.y, time: Date.now() };
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.onPointer(pointer));
    this.time.addEvent({ delay: 1000, loop: true, callback: () => {
      if (!this.busy && !this.completed && Date.now() - this.lastAction >= 5000 && this.engine.moves < stage01.moves) { this.hint = this.findMove(); this.message = 'ここを うごかしてみよう！'; this.draw(); }
    }});
    this.draw();
  }

  private layout(): void {
    const { width, height } = this.scale;
    this.cellSize = Math.min((width - 36) / 5, (height - 350) / 5, 78);
    this.boardX = (width - this.cellSize * 5) / 2;
    this.boardY = Math.max(250, (height - this.cellSize * 5 - 80) / 2);
    this.draw();
  }

  private draw(): void {
    if (!this.engine || !this.add) return;
    this.children.removeAll(true);
    const { width, height } = this.scale;
    this.add.ellipse(width / 2, height - 6, width * 1.4, 150, 0x8cca60).setAlpha(0.38);
    this.panel(width / 2, 66, Math.min(width - 30, 400), 95, 0xf8d288, 0xa9662f);
    this.add.text(width / 2, 39, 'ひなポコ', { fontFamily: 'system-ui, sans-serif', fontSize: '38px', fontStyle: 'bold', color: '#ff6684', stroke: '#ffffff', strokeThickness: 7 }).setOrigin(0.5);
    this.add.text(width / 2, 80, 'どうぶつを ならべて あそぼう！', { fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#76502f' }).setOrigin(0.5);

    const cardY = 174, cardW = Math.min((width - 42) / 2, 182);
    this.panel(width / 2 - cardW / 2 - 5, cardY, cardW, 76, 0xfff3ce, 0xc77b3c);
    this.add.text(width / 2 - cardW / 2 - 5, cardY - 17, 'のこり', { fontSize: '14px', color: '#795334', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2 - cardW / 2 - 5, cardY + 10, `${this.engine.moves}`, { fontSize: '38px', color: '#f04755', fontStyle: 'bold', stroke: '#fff', strokeThickness: 5 }).setOrigin(0.5);
    this.panel(width / 2 + cardW / 2 + 5, cardY, cardW, 76, 0xfff3ce, 0xc77b3c);
    this.add.text(width / 2 + cardW / 2 + 5, cardY - 17, 'いた', { fontSize: '14px', color: '#795334', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2 + cardW / 2 + 5, cardY + 10, `${Math.min(this.engine.slabsBroken, stage01.slabGoal)} / ${stage01.slabGoal}`, { fontSize: '29px', color: '#7b5535', fontStyle: 'bold', stroke: '#fff', strokeThickness: 4 }).setOrigin(0.5);

    this.panel(width / 2, this.boardY + this.cellSize * 2.5, this.cellSize * 5 + 16, this.cellSize * 5 + 16, 0xb97a43, 0x87512c);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const x = this.boardX + (c + 0.5) * this.cellSize, y = this.boardY + (r + 0.5) * this.cellSize;
      const cell = this.engine.board[r][c];
      this.add.rectangle(x, y, this.cellSize - 5, this.cellSize - 5, 0x97623b).setStrokeStyle(2, 0x7d4d2f).setOrigin(0.5);
      if (cell.slab) {
        this.add.rectangle(x, y, this.cellSize - 11, this.cellSize - 11, 0xe8c99f).setStrokeStyle(3, 0xb18a5d).setAlpha(0.94);
        this.add.text(x, y + 1, '🐾', { fontSize: `${this.cellSize * 0.43}px` }).setOrigin(0.5).setAlpha(0.7);
      }
      this.add.ellipse(x, y + this.cellSize * 0.31, this.cellSize * 0.6, this.cellSize * 0.15, 0x573920).setAlpha(0.24);
      this.add.circle(x, y, this.cellSize * 0.39, palette[cell.animal]);
      this.add.circle(x - this.cellSize * 0.1, y - this.cellSize * 0.1, this.cellSize * 0.28, 0xffffff).setAlpha(0.14);
      this.add.text(x, y, animals[cell.animal], { fontSize: `${this.cellSize * 0.55}px` }).setOrigin(0.5);
      if (this.selected?.row === r && this.selected.col === c) this.add.rectangle(x, y, this.cellSize - 4, this.cellSize - 4).setStrokeStyle(5, 0xfff06a);
      if (this.hint?.some(p => p.row === r && p.col === c)) this.add.rectangle(x, y, this.cellSize - 5, this.cellSize - 5).setStrokeStyle(5, 0x70f4fc).setAlpha(0.95);
    }
    if (this.hint) {
      const [a, b] = this.hint;
      const ax = this.boardX + (a.col + 0.5) * this.cellSize, ay = this.boardY + (a.row + 0.5) * this.cellSize;
      const bx = this.boardX + (b.col + 0.5) * this.cellSize, by = this.boardY + (b.row + 0.5) * this.cellSize;
      const arrow = this.add.text((ax + bx) / 2, (ay + by) / 2, '↔', { fontSize: `${this.cellSize * 0.45}px`, color: '#ffffff', stroke: '#e88735', strokeThickness: 5, fontStyle: 'bold' }).setOrigin(0.5);
      this.tweens.add({ targets: arrow, scale: 1.3, duration: 380, yoyo: true, repeat: -1 });
    }

    this.panel(width / 2, this.boardY + this.cellSize * 5 + 48, Math.min(width - 40, 380), 48, 0xffefc5, 0xcf8b47);
    this.add.text(width / 2, this.boardY + this.cellSize * 5 + 48, this.message, { fontSize: '17px', color: '#704c2e', fontStyle: 'bold' }).setOrigin(0.5);
    const buttonsY = height - 48;
    this.button(width * 0.28, buttonsY, '🔄', 'もういちど', () => this.reset());
    this.button(width * 0.72, buttonsY, this.soundEnabled ? '🔊' : '🔇', 'おと', () => { this.soundEnabled = !this.soundEnabled; this.draw(); });

    if (this.completed) {
      this.add.rectangle(width / 2, height / 2, width, height, 0x382418).setAlpha(0.6);
      this.panel(width / 2, height / 2, width * 0.82, 200, 0xfff2c8, 0xf0a84c);
      this.add.text(width / 2, height / 2 - 30, 'やったね！', { fontSize: '34px', color: '#f07361', fontStyle: 'bold' }).setOrigin(0.5);
      this.add.text(width / 2, height / 2 + 24, 'いたを ぜんぶ こわせたよ ⭐', { fontSize: '18px', color: '#76502f', fontStyle: 'bold' }).setOrigin(0.5);
    } else if (this.engine.state === 'FAILED') {
      this.add.rectangle(width / 2, height / 2, width, height, 0x382418).setAlpha(0.55);
      this.panel(width / 2, height / 2, width * 0.8, 170, 0xfff2c8, 0xf0a84c);
      this.add.text(width / 2, height / 2 - 20, 'もういっかい！', { fontSize: '30px', color: '#f07361', fontStyle: 'bold' }).setOrigin(0.5);
      this.add.text(width / 2, height / 2 + 34, '🔄 をおしてね', { fontSize: '20px', color: '#76502f', fontStyle: 'bold' }).setOrigin(0.5);
    }
  }

  private panel(x: number, y: number, w: number, h: number, fill: number, edge: number): void { this.add.rectangle(x, y + 3, w, h, 0x794a28).setOrigin(0.5).setAlpha(0.22); this.add.rectangle(x, y, w, h, fill).setOrigin(0.5).setStrokeStyle(4, edge); }
  private button(x: number, y: number, icon: string, label: string, click: () => void): void {
    this.add.circle(x, y, 27, 0xefa24d).setStrokeStyle(3, 0xc36e36);
    this.add.text(x, y - 2, icon, { fontSize: '24px' }).setOrigin(0.5);
    this.add.text(x, y + 37, label, { fontSize: '13px', color: '#684323', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.zone(x, y, 76, 76).setInteractive().on('pointerdown', click);
  }

  private onPointer(pointer: Phaser.Input.Pointer): void {
    if (!this.touchStart || pointer.id !== this.touchPointerId) return;
    if (this.touchStart && Date.now() - this.touchStart.time < 850 && !this.busy && !this.completed) {
      const start = this.toCell(this.touchStart.x, this.touchStart.y), end = this.toCell(pointer.x, pointer.y);
      if (start && end && (start.row !== end.row || start.col !== end.col)) { this.touchStart = null; this.touchPointerId = null; this.tryMove(start, end); return; }
      const tapped = this.toCell(pointer.x, pointer.y);
      if (!tapped) { this.selected = null; this.hint = null; this.draw(); this.touchStart = null; this.touchPointerId = null; return; }
      if (this.selected && Math.abs(this.selected.row - tapped.row) + Math.abs(this.selected.col - tapped.col) === 1) { this.touchStart = null; this.touchPointerId = null; this.tryMove(this.selected, tapped); return; }
      this.selected = tapped; this.hint = null; this.lastAction = Date.now(); this.message = 'となりの どうぶつを えらんでね'; this.draw();
    }
    this.touchStart = null;
    this.touchPointerId = null;
  }

  private toCell(x: number, y: number): Position | null {
    const col = Math.floor((x - this.boardX) / this.cellSize), row = Math.floor((y - this.boardY) / this.cellSize);
    return row >= 0 && row < 5 && col >= 0 && col < 5 ? { row, col } : null;
  }

  private async tryMove(a: Position, b: Position): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.selected = null; this.hint = null; this.lastAction = Date.now(); this.message = 'ぽんっ！'; this.draw();
    const result = await this.engine.play(a, b);
    this.busy = false; this.lastAction = Date.now();
    if (!result.accepted) { this.message = 'となりの どうぶつを えらんでね'; this.draw(); return; }
    this.sounds.play(470 + result.cascades * 75);
    this.message = result.cascades > 1 ? `${result.cascades}れんさ！ すごい！` : 'いいね！';
    if (result.state === 'COMPLETE') { this.completed = true; saveStage(2); this.sounds.play(750); }
    this.draw();
  }

  private findMove(): [Position, Position] | null {
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const a = { row: r, col: c }, b = { row: r + dr, col: c + dc };
      if (b.row >= 5 || b.col >= 5) continue;
      const x = this.engine.board[r][c].animal, y = this.engine.board[b.row][b.col].animal;
      this.engine.board[r][c].animal = y; this.engine.board[b.row][b.col].animal = x;
      const valid = findMatches(this.engine.board).length > 0;
      this.engine.board[r][c].animal = x; this.engine.board[b.row][b.col].animal = y;
      if (valid) return [a, b];
    }
    return null;
  }

  private reset(): void {
    this.engine = new Game(stage01, Date.now()); this.completed = false; this.selected = null;
    this.hint = stage01.tutorialSwap?.map(([row, col]) => ({ row, col })) as [Position, Position] | null;
    this.message = this.hint ? 'ひかる どうぶつを うごかそう！' : 'どうぶつを うごかそう！';
    this.lastAction = Date.now(); this.draw();
  }
}

new Phaser.Game({ type: Phaser.AUTO, parent: 'game', backgroundColor: '#8ddbf4', scale: { mode: Phaser.Scale.RESIZE, width: 430, height: 860 }, render: { antialias: true, roundPixels: true }, scene: [PlayScene], input: { activePointers: 2 } });
