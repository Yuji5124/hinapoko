import Phaser from 'phaser';
import stage01 from './game/levels/stage01.json';
import stage02 from './game/levels/stage02.json';
import stage03 from './game/levels/stage03.json';
import stage04 from './game/levels/stage04.json';
import stage05 from './game/levels/stage05.json';
import stage06 from './game/levels/stage06.json';
import stage07 from './game/levels/stage07.json';
import stage08 from './game/levels/stage08.json';
import stage09 from './game/levels/stage09.json';
import stage10 from './game/levels/stage10.json';
import { Game, saveStage, savedStage } from './game/core/game';
import { findMatches, type Position, type Stage } from './game/core/board';
import './style.css';

const palette = [0xffdf68, 0xffb2ce, 0xc8885a, 0x79c5ff, 0xff9c68];
const stages = [stage01,stage02,stage03,stage04,stage05,stage06,stage07,stage08,stage09,stage10] as Stage[];

class PlayScene extends Phaser.Scene {
  private engine!: Game;
  private activeStage!: Stage;
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
    this.loadStage(Math.min(stages.length, savedStage()));
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
      if (!this.busy && !this.completed && Date.now() - this.lastAction >= 5000 && (!this.activeStage.tutorialSwap || this.engine.moves < this.activeStage.moves)) { this.hint = this.findMove(); this.message = 'ここを うごかしてみよう！'; this.draw(); }
    }});
    this.draw();
  }

  private layout(): void {
    const { width, height } = this.scale;
    const columns = this.engine?.stage.columns ?? 5, rows = this.engine?.stage.rows ?? 5;
    this.cellSize = Math.min((width - 36) / columns, (height - 350) / rows, 78);
    this.boardX = (width - this.cellSize * columns) / 2;
    this.boardY = Math.max(230, (height - this.cellSize * rows - 150) / 2);
    this.draw();
  }

  private draw(): void {
    if (!this.engine || !this.add) return;
    this.children.removeAll(true);
    const { width, height } = this.scale;
    this.drawBackground(width, height);
    this.panel(width / 2, 66, Math.min(width - 30, 400), 95, 0xf8d288, 0xa9662f);
    this.add.text(width / 2, 39, 'ひなポコ', { fontFamily: 'system-ui, sans-serif', fontSize: '38px', fontStyle: 'bold', color: '#ff6684', stroke: '#ffffff', strokeThickness: 7 }).setOrigin(0.5);
    this.add.text(width / 2, 80, `ステージ ${String(this.activeStage.id).padStart(2, '0')} · どうぶつを けそう！`, { fontFamily: 'system-ui, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#76502f' }).setOrigin(0.5);

    const cardY = 174, cardW = Math.min((width - 42) / 2, 182);
    this.panel(width / 2 - cardW / 2 - 5, cardY, cardW, 76, 0xfff3ce, 0xc77b3c);
    this.add.text(width / 2 - cardW / 2 - 5, cardY - 17, 'のこり', { fontSize: '14px', color: '#795334', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2 - cardW / 2 - 5, cardY + 10, `${this.engine.moves}`, { fontSize: '38px', color: '#f04755', fontStyle: 'bold', stroke: '#fff', strokeThickness: 5 }).setOrigin(0.5);
    this.panel(width / 2 + cardW / 2 + 5, cardY, cardW, 76, 0xfff3ce, 0xc77b3c);
    const goalCardX = width / 2 + cardW / 2 + 5;
    this.add.text(goalCardX, cardY - 17, 'けした どうぶつ', { fontSize: '14px', color: '#795334', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(goalCardX, cardY + 10, `${Math.min(this.engine.animalsCleared, this.activeStage.animalGoal)} / ${this.activeStage.animalGoal} ひき`, { fontSize: '23px', color: '#7b5535', fontStyle: 'bold', stroke: '#fff', strokeThickness: 4 }).setOrigin(0.5);

    this.panel(width / 2, this.boardY + this.cellSize * this.activeStage.rows / 2, this.cellSize * this.activeStage.columns + 16, this.cellSize * this.activeStage.rows + 16, 0xb97a43, 0x87512c);
    const matching = this.engine.state === 'MATCHING' ? new Set(findMatches(this.engine.board).flatMap(m=>m.cells.map(p=>`${p.row},${p.col}`))) : new Set<string>();
    for (let r = 0; r < this.activeStage.rows; r++) for (let c = 0; c < this.activeStage.columns; c++) {
      const x = this.boardX + (c + 0.5) * this.cellSize, y = this.boardY + (r + 0.5) * this.cellSize;
      const cell = this.engine.board[r][c];
      this.add.rectangle(x, y, this.cellSize - 5, this.cellSize - 5, 0x97623b).setStrokeStyle(2, 0x7d4d2f).setOrigin(0.5);
      if (cell.hole) { this.add.ellipse(x, y, this.cellSize * 0.64, this.cellSize * 0.48, 0x382719).setStrokeStyle(4, 0x8b623c); continue; }
      if (cell.animal < 0) {
        if (this.engine.state === 'FALLING') for (let i=0;i<3;i++) this.add.ellipse(x+(i-1)*this.cellSize*.13,y-this.cellSize*.08,this.cellSize*.045,this.cellSize*.19,0xfff5d2).setAlpha(.65);
        continue;
      }
      this.add.ellipse(x, y + this.cellSize * 0.31, this.cellSize * 0.6, this.cellSize * 0.15, 0x573920).setAlpha(0.24);
      this.drawAnimal(x, y, cell.animal);
      if (matching.has(`${r},${c}`)) {
        const pop=this.add.circle(x,y,this.cellSize*.35,0xfff7bd).setAlpha(.62);
        const ring=this.add.circle(x,y,this.cellSize*.34).setStrokeStyle(3,0xffffff).setAlpha(.9);
        this.tweens.add({targets:[pop,ring],scale:1.42,alpha:0,duration:250,ease:'Back.Out'});
        for (let i=0;i<4;i++) {
          const sparkle=this.add.star(x+Math.cos(i*Math.PI/2)*this.cellSize*.16,y+Math.sin(i*Math.PI/2)*this.cellSize*.16,4,this.cellSize*.035,this.cellSize*.075,0xffc83d).setAlpha(.95);
          this.tweens.add({targets:sparkle,x:x+Math.cos(i*Math.PI/2)*this.cellSize*.43,y:y+Math.sin(i*Math.PI/2)*this.cellSize*.43,alpha:0,angle:90,duration:230,ease:'Cubic.Out'});
        }
      } else if (this.engine.state === 'REFILLING' && this.engine.refilledCells.has(`${r},${c}`)) {
        const sparkle=this.add.star(x,y,this.engine.cascadeNumber > 0 ? 5 : 4,this.cellSize*.035,this.cellSize*.15,0xfff4a3).setAlpha(.9);
        this.tweens.add({targets:sparkle,scale:1.9,angle:65,alpha:0,duration:330,ease:'Back.Out'});
      }
      if (cell.bomb) {
        const mark = cell.bomb === 'arrow-row' ? '↔️' : cell.bomb === 'arrow-column' ? '↕️' : cell.bomb === 'double' ? '💣' : '🌈';
        this.add.text(x + this.cellSize * 0.25, y - this.cellSize * 0.26, mark, { fontSize: `${this.cellSize * 0.3}px`, stroke: '#ffffff', strokeThickness: 3 }).setOrigin(0.5);
      }
      if (this.selected?.row === r && this.selected.col === c) this.add.rectangle(x, y, this.cellSize - 4, this.cellSize - 4).setStrokeStyle(5, 0xfff06a);
      if (this.hint?.some(p => p.row === r && p.col === c)) this.add.rectangle(x, y, this.cellSize - 5, this.cellSize - 5).setStrokeStyle(5, 0x70f4fc).setAlpha(0.95);
    }
    if (this.engine.state === 'MATCHING' && this.engine.cascadeNumber > 0) {
      const chain = this.add.text(width / 2, this.boardY - 9, `${this.engine.cascadeNumber + 1}れんさ！`, { fontSize: '21px', fontStyle: 'bold', color: '#fff8bf', stroke: '#e4824c', strokeThickness: 5 }).setOrigin(0.5);
      this.tweens.add({ targets: chain, scale: 1.18, yoyo: true, duration: 100, ease: 'Back.Out' });
    }
    if (this.hint) {
      const [a, b] = this.hint;
      const ax = this.boardX + (a.col + 0.5) * this.cellSize, ay = this.boardY + (a.row + 0.5) * this.cellSize;
      const bx = this.boardX + (b.col + 0.5) * this.cellSize, by = this.boardY + (b.row + 0.5) * this.cellSize;
      const arrow = this.add.text((ax + bx) / 2, (ay + by) / 2, '↔', { fontSize: `${this.cellSize * 0.45}px`, color: '#ffffff', stroke: '#e88735', strokeThickness: 5, fontStyle: 'bold' }).setOrigin(0.5);
      this.tweens.add({ targets: arrow, scale: 1.3, duration: 380, yoyo: true, repeat: -1 });
    }

    this.panel(width / 2, this.boardY + this.cellSize * this.activeStage.rows + 43, Math.min(width - 40, 380), 46, 0xffefc5, 0xcf8b47);
    this.add.text(width / 2, this.boardY + this.cellSize * this.activeStage.rows + 43, this.message, { fontSize: '17px', color: '#704c2e', fontStyle: 'bold' }).setOrigin(0.5);
    const buttonsY = height - 48;
    this.button(width * 0.28, buttonsY, '🔄', 'もういちど', () => this.reset());
    this.button(width * 0.72, buttonsY, this.soundEnabled ? '🔊' : '🔇', 'おと', () => { this.soundEnabled = !this.soundEnabled; this.draw(); });

    if (this.completed) {
      this.add.rectangle(width / 2, height / 2, width, height, 0x382418).setAlpha(0.6);
      this.panel(width / 2, height / 2, width * 0.82, 200, 0xfff2c8, 0xf0a84c);
      this.add.text(width / 2, height / 2 - 30, 'やったね！', { fontSize: '34px', color: '#f07361', fontStyle: 'bold' }).setOrigin(0.5);
      this.add.text(width / 2, height / 2 + 18, 'どうぶつを たくさん けせたね！ ⭐', { fontSize: '18px', color: '#76502f', fontStyle: 'bold' }).setOrigin(0.5);
      this.button(width / 2, height / 2 + 72, this.activeStage.id < stages.length ? '➡️' : '🔄', this.activeStage.id < stages.length ? 'つぎへ' : 'さいしょから', () => this.loadStage(this.activeStage.id < stages.length ? this.activeStage.id + 1 : 1));
    } else if (this.engine.state === 'FAILED') {
      this.add.rectangle(width / 2, height / 2, width, height, 0x382418).setAlpha(0.55);
      this.panel(width / 2, height / 2, width * 0.8, 170, 0xfff2c8, 0xf0a84c);
      this.add.text(width / 2, height / 2 - 20, 'もういっかい！', { fontSize: '30px', color: '#f07361', fontStyle: 'bold' }).setOrigin(0.5);
      this.add.text(width / 2, height / 2 + 34, '🔄 をおしてね', { fontSize: '20px', color: '#76502f', fontStyle: 'bold' }).setOrigin(0.5);
    }
  }

  private panel(x: number, y: number, w: number, h: number, fill: number, edge: number): void { this.add.rectangle(x, y + 3, w, h, 0x794a28).setOrigin(0.5).setAlpha(0.22); this.add.rectangle(x, y, w, h, fill).setOrigin(0.5).setStrokeStyle(4, edge); }
  private drawBackground(width: number, height: number): void {
    this.add.rectangle(width/2,height/2,width,height,0x79d6fa).setDepth(-12);
    this.add.rectangle(width/2,height*.23,width,height*.46,0xffd9ec).setAlpha(.25).setDepth(-11);
    this.add.circle(width-51,72,51,0xffa83e).setAlpha(.28).setDepth(-10);
    this.add.circle(width-51,72,37,0xffe769).setStrokeStyle(5,0xfff7b0).setDepth(-9);
    for(let i=0;i<12;i++) {
      const a=i*Math.PI/6, x1=width-51+Math.cos(a)*44, y1=72+Math.sin(a)*44, x2=width-51+Math.cos(a)*56, y2=72+Math.sin(a)*56;
      this.add.line(0,0,x1,y1,x2,y2,0xfff4a7,.95).setLineWidth(4).setDepth(-9);
    }
    for (const [cx,cy,s] of [[42,111,1],[width-26,157,.95],[width*.2,48,.58],[width*.72,110,.7],[width*.48,152,.5]] as number[][]) {
      const cloud=this.add.container(cx,cy).setDepth(-8).setAlpha(.98).setScale(s);
      cloud.add([this.add.ellipse(0,8,91,32,0xffffff),this.add.circle(-25,1,22,0xffffff),this.add.circle(1,-9,29,0xffffff),this.add.circle(28,2,20,0xffffff)]);
    }
    this.add.ellipse(width*.1,height+42,width*1.15,220,0x65c86f).setAlpha(.94).setDepth(-7);
    this.add.ellipse(width*.83,height+55,width*1.2,250,0x83d65e).setAlpha(.92).setDepth(-7);
    for(let i=0;i<36;i++) {
      const side=i%2===0, lane=Math.floor(i/2), x=side?12+lane%3*13:width-12-lane%3*13;
      const y=218+lane*48;
      if(y>height-12) continue;
      const flower=this.add.container(x,y).setDepth(-6).setAlpha(.98).setScale(lane%4===0?1.25:1);
      const tint=[0xfff34f,0xff87bc,0xffffff,0xffa85e,0xc7a5ff][lane%5];
      flower.add([this.add.circle(0,-6,5.5,tint),this.add.circle(-6,0,5.5,tint),this.add.circle(6,0,5.5,tint),this.add.circle(0,6,5.5,tint),this.add.circle(0,0,2.8,0xffa72e)]);
      flower.add([this.add.ellipse(-8,14,6,13,0x69c947).setAngle(-38),this.add.ellipse(8,17,6,13,0x56b944).setAngle(38)]);
    }
    for(let i=0;i<20;i++) {
      const x=(i*71+19)%(width||1), y=176+(i*89)%(Math.max(130,height-210));
      this.add.star(x,y,4,2.5,6,[0xffffff,0xfff080,0xffa9d0][i%3]).setAlpha(.9).setDepth(-5);
    }
  }
  private drawAnimal(x: number, y: number, kind: number): void {
    const s = this.cellSize, r = s * 0.31;
    if (kind === 0) {
      this.add.ellipse(x-s*.19,y+s*.02,s*.19,s*.31,0xf5c73f);
      this.add.ellipse(x+s*.19,y+s*.02,s*.19,s*.31,0xf5c73f);
      this.add.circle(x,y,r,palette[0]).setStrokeStyle(1,0xe4a930);
      this.add.ellipse(x-s*.1,y-s*.2,s*.22,s*.08,0xfff3a2);
      this.add.ellipse(x-s*.065,y-s*.015,s*.045,s*.07,0x382d27);
      this.add.ellipse(x+s*.09,y-s*.015,s*.045,s*.07,0x382d27);
      this.add.triangle(x,y+s*.055,-s*.09,-s*.005,s*.09,-s*.005,0,s*.13,0xf47731);
      this.add.ellipse(x-s*.17,y+s*.12,s*.1,s*.055,0xffa34b);
      this.add.ellipse(x+s*.17,y+s*.12,s*.1,s*.055,0xffa34b);
      this.add.ellipse(x-s*.08,y-r*.9,s*.085,s*.12,0xffdf68).setAngle(-32);
      this.add.ellipse(x+s*.08,y-r*.9,s*.085,s*.12,0xffdf68).setAngle(32);
    } else if (kind === 1) {
      this.add.ellipse(x-s*.12,y-s*.29,s*.14,s*.35,0xffc4d8).setAngle(-10);
      this.add.ellipse(x+s*.12,y-s*.29,s*.14,s*.35,0xffc4d8).setAngle(10);
      this.add.ellipse(x-s*.12,y-s*.3,s*.065,s*.23,0xf58eaf).setAngle(-10);
      this.add.ellipse(x+s*.12,y-s*.3,s*.065,s*.23,0xf58eaf).setAngle(10);
      this.add.circle(x,y,r,0xffd2e1).setStrokeStyle(1,0xe991ae);
      this.add.ellipse(x-s*.1,y-s*.045,s*.045,s*.075,0x49302d);
      this.add.ellipse(x+s*.1,y-s*.045,s*.045,s*.075,0x49302d);
      this.add.ellipse(x,y+s*.09,s*.14,s*.1,0xfff5ef);
      this.add.triangle(x,y+s*.07,-s*.045,-s*.012,s*.045,-s*.012,0,s*.04,0xe77d9d);
      this.add.circle(x-s*.2,y+s*.1,s*.04,0xf29ab3).setAlpha(.65);
      this.add.circle(x+s*.2,y+s*.1,s*.04,0xf29ab3).setAlpha(.65);
    } else if (kind === 2) {
      this.add.circle(x-s*.23,y-s*.2,s*.15,0x855233).setStrokeStyle(2,0x613b29);
      this.add.circle(x+s*.23,y-s*.2,s*.15,0x855233).setStrokeStyle(2,0x613b29);
      this.add.circle(x-s*.23,y-s*.2,s*.075,0xf4b882);
      this.add.circle(x+s*.23,y-s*.2,s*.075,0xf4b882);
      this.add.circle(x,y,r,0xb7784d).setStrokeStyle(2,0x68412c);
      this.add.ellipse(x-s*.1,y-s*.04,s*.045,s*.07,0x322723);
      this.add.ellipse(x+s*.1,y-s*.04,s*.045,s*.07,0x322723);
      this.add.ellipse(x,y+s*.105,s*.22,s*.15,0xffe3c5);
      this.add.ellipse(x,y+s*.06,s*.085,s*.055,0x392722);
    } else if (kind === 3) {
      this.add.triangle(x-s*.2,y-s*.2,-s*.17,s*.07,0,-s*.25,s*.02,s*.09,0x76baf4).setStrokeStyle(2,0x3778c4);
      this.add.triangle(x+s*.2,y-s*.2,-s*.02,s*.09,0,-s*.25,s*.17,s*.07,0x76baf4).setStrokeStyle(2,0x3778c4);
      this.add.circle(x,y,r,0x65b2f6).setStrokeStyle(2,0x3778c4);
      this.add.ellipse(x-s*.1,y-s*.05,s*.045,s*.075,0x202b36);
      this.add.ellipse(x+s*.1,y-s*.05,s*.045,s*.075,0x202b36);
      this.add.triangle(x,y+s*.065,-s*.04,-s*.015,s*.04,-s*.015,0,s*.035,0x263847);
      this.add.rectangle(x-s*.23,y+s*.13,s*.12,s*.025,0xffffff).setAngle(18);
      this.add.rectangle(x+s*.23,y+s*.13,s*.12,s*.025,0xffffff).setAngle(-18);
    } else {
      this.add.ellipse(x-s*.24,y-s*.08,s*.18,s*.34,0x8c5839).setAngle(-22);
      this.add.ellipse(x+s*.24,y-s*.08,s*.18,s*.34,0x8c5839).setAngle(22);
      this.add.circle(x,y,r,0xffbd83).setStrokeStyle(2,0xc77a4c);
      this.add.ellipse(x-s*.105,y-s*.04,s*.045,s*.07,0x392b26);
      this.add.ellipse(x+s*.105,y-s*.04,s*.045,s*.07,0x392b26);
      this.add.ellipse(x,y+s*.105,s*.17,s*.12,0xfff1dd);
      this.add.ellipse(x,y+s*.065,s*.075,s*.05,0x4b3029);
      this.add.ellipse(x-s*.19,y+s*.13,s*.075,s*.045,0xf18d78);
      this.add.ellipse(x+s*.19,y+s*.13,s*.075,s*.045,0xf18d78);
    }
    this.add.ellipse(x-s*.11,y-s*.21,s*.075,s*.035,0xffffff).setAlpha(.5);
  }
  private button(x: number, y: number, icon: string, label: string, click: () => void): void {
    this.add.circle(x, y, 27, 0xefa24d).setStrokeStyle(3, 0xc36e36);
    this.add.text(x, y - 2, icon, { fontSize: '24px' }).setOrigin(0.5);
    this.add.text(x, y + 37, label, { fontSize: '13px', color: '#684323', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.zone(x, y, 76, 76).setInteractive().on('pointerdown', click);
  }

  private onPointer(pointer: Phaser.Input.Pointer): void {
    if (!this.touchStart || pointer.id !== this.touchPointerId) return;
    if (this.touchStart && !this.busy && !this.completed) {
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
    return row >= 0 && row < this.activeStage.rows && col >= 0 && col < this.activeStage.columns && !this.engine.board[row][col].hole ? { row, col } : null;
  }

  private async tryMove(a: Position, b: Position): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.selected = null; this.hint = null; this.lastAction = Date.now(); this.message = 'ぽんっ！'; this.draw();
    const result = await this.engine.play(a, b, async (ms) => {
      this.draw();
      await new Promise(resolve => setTimeout(resolve, ms));
    });
    this.busy = false; this.lastAction = Date.now();
    if (!result.accepted) { this.message = 'となりの どうぶつを えらんでね'; this.draw(); return; }
    this.sounds.play(470 + result.cascades * 75);
    this.message = result.cascades > 1 ? `${result.cascades}れんさ！ すごい！` : 'いいね！';
    if (result.state === 'COMPLETE') { this.completed = true; saveStage(this.activeStage.id + 1); this.sounds.play(750); }
    this.draw();
  }

  private findMove(): [Position, Position] | null {
    for (let r = 0; r < this.activeStage.rows; r++) for (let c = 0; c < this.activeStage.columns; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const a = { row: r, col: c }, b = { row: r + dr, col: c + dc };
      if (b.row >= this.activeStage.rows || b.col >= this.activeStage.columns || this.engine.board[r][c].hole || this.engine.board[b.row][b.col].hole) continue;
      if (this.engine.board[r][c].bomb || this.engine.board[b.row][b.col].bomb) return [a,b];
      const x = this.engine.board[r][c].animal, y = this.engine.board[b.row][b.col].animal;
      this.engine.board[r][c].animal = y; this.engine.board[b.row][b.col].animal = x;
      const valid = findMatches(this.engine.board).length > 0;
      this.engine.board[r][c].animal = x; this.engine.board[b.row][b.col].animal = y;
      if (valid) return [a, b];
    }
    return null;
  }

  private loadStage(id: number): void {
    this.activeStage = stages[id - 1];
    const seed = Number(new URLSearchParams(location.search).get('seed') || 20251018);
    this.engine = new Game(this.activeStage, seed + id * 997);
    this.completed = false; this.selected = null;
    this.hint = this.activeStage.tutorialSwap?.map(([row, col]) => ({ row, col })) as [Position, Position] | null;
    this.message = this.hint ? 'ひかる どうぶつを うごかそう！' : 'どうぶつを うごかそう！';
    this.lastAction = Date.now(); this.draw();
  }
  private reset(): void { this.loadStage(this.activeStage.id); }
}

new Phaser.Game({ type: Phaser.AUTO, parent: 'game', backgroundColor: '#8ddbf4', scale: { mode: Phaser.Scale.RESIZE, width: 430, height: 860 }, render: { antialias: true, roundPixels: true }, scene: [PlayScene], input: { activePointers: 2 } });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const script = new URL('sw.js', document.baseURI);
    const scope = new URL('./', document.baseURI).pathname;
    void navigator.serviceWorker.register(script, { scope }).catch(() => undefined);
  });
}
