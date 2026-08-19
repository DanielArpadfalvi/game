import Phaser from "phaser";
import { WinterBackground } from "../bg";
import { ATTACKERS, CHAMPIONS, CONFIG, AttackerDef, ChampionDef } from "../data";
import { button, css } from "../helpers";

interface Enemy {
  obj: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  def: AttackerDef;
  x: number; y: number;
  fireTimer: number;
  drift: number;
  spawnT: number;
  castT: number;
  dead: boolean;
}

interface Shot {
  obj: Phaser.GameObjects.Image;
  x: number; y: number; vx: number; vy: number;
  r: number; dmg: number; color: number; style: string;
  life: number; traveled: number; range: number;
  trail: { x: number; y: number }[];
  homing: boolean; target: Enemy | null;
  dead: boolean;
}

interface Telegraph {
  kind: "line" | "circle";
  x: number; y: number; ang: number;
  width: number; length: number; radius: number;
  warn: number; t: number; dmg: number; color: number; style: string;
  done: boolean;
}

interface Lob { sx: number; sy: number; tx: number; ty: number; t: number; dur: number; }
interface Particle { x: number; y: number; vx: number; vy: number; r: number; t: number; dur: number; color: number; ring: boolean; maxR: number; }

export class GameScene extends Phaser.Scene {
  private champ!: ChampionDef;
  private hero!: Phaser.GameObjects.Image;

  private px = 0; private py = 0; private tx = 0; private ty = 0;
  private facing = 0;
  private hp = CONFIG.maxHp;
  private flashCd = 0; private basicCd = 0; private abilityCd = 0;
  private invuln = 0; private hitFlash = 0;
  private dash: { fx: number; fy: number; tx: number; ty: number; t: number; dur: number } | null = null;
  private ghosts: { x: number; y: number; t: number }[] = [];

  private enemies: Enemy[] = [];
  private enemyShots: Shot[] = [];
  private playerShots: Shot[] = [];
  private telegraphs: Telegraph[] = [];
  private lobs: Lob[] = [];
  private particles: Particle[] = [];

  private gfxTele!: Phaser.GameObjects.Graphics;
  private gfxFx!: Phaser.GameObjects.Graphics;

  private elapsed = 0; private score = 0; private wave = 1; private kills = 0;
  private difficulty = 1; private spawnTimer = 0.7; private waveTimer = 0; private spawnIndex = 0;
  private over = false;

  // publikus, hogy a UIScene olvashassa
  public getStats() {
    return {
      score: this.score, wave: this.wave, best: this.registry.get("best") as number,
      hp: this.hp, maxHp: CONFIG.maxHp,
      basic: this.basicCd, basicMax: CONFIG.basicCd,
      ability: this.abilityCd, abilityMax: this.champ.abilityCd,
      flash: this.flashCd, flashMax: CONFIG.flashCd,
      abilityKey: this.champ.abilityKey, abilityName: this.champ.abilityName,
    };
  }

  constructor() {
    super("Game");
  }

  create(): void {
    this.resetState();
    new WinterBackground(this);
    const key = (this.registry.get("champ") as string) || "ezreal";
    this.champ = CHAMPIONS.find((c) => c.key === key)!;

    this.px = this.tx = this.scale.width / 2;
    this.py = this.ty = this.scale.height / 2;

    this.gfxTele = this.add.graphics().setDepth(1);
    this.hero = this.add.image(this.px, this.py, `hero_${this.champ.key}`).setDisplaySize(44, 44).setDepth(6);
    this.gfxFx = this.add.graphics().setDepth(8);

    this.setupInput();

    if (!this.scene.isActive("UI")) this.scene.launch("UI");
    this.scene.bringToTop("UI");

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop("UI"));
  }

  private resetState(): void {
    this.enemies = []; this.enemyShots = []; this.playerShots = [];
    this.telegraphs = []; this.lobs = []; this.particles = []; this.ghosts = [];
    this.hp = CONFIG.maxHp; this.flashCd = 0; this.basicCd = 0; this.abilityCd = 0;
    this.invuln = 0; this.hitFlash = 0; this.dash = null;
    this.elapsed = 0; this.score = 0; this.wave = 1; this.kills = 0;
    this.difficulty = 1; this.spawnTimer = 0.7; this.waveTimer = 0; this.spawnIndex = 0;
    this.over = false;
  }

  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.over) return;
      if (p.rightButtonDown()) {
        this.tx = Phaser.Math.Clamp(p.worldX, 0, this.scale.width);
        this.ty = Phaser.Math.Clamp(p.worldY, 0, this.scale.height);
        this.ring(this.tx, this.ty, 16, 0x0ac8b9);
      } else if (p.leftButtonDown()) {
        this.castBasic(p);
      }
    });
    const kb = this.input.keyboard!;
    kb.on("keydown-F", () => !this.over && this.castFlash());
    kb.on("keydown-" + this.champ.abilityKey.toUpperCase(), () => {
      if (this.over) return;
      if (this.champ.ability === "arcaneShift") this.castArcaneShift();
      else this.castTumble();
    });
  }

  // ---------------- Bemenet / képességek ----------------
  private pointer(): Phaser.Input.Pointer { return this.input.activePointer; }

  private castBasic(p: Phaser.Input.Pointer): void {
    if (this.basicCd > 0) return;
    this.basicCd = CONFIG.basicCd;
    const ang = Math.atan2(p.worldY - this.py, p.worldX - this.px);
    this.facing = ang;
    this.spawnPlayerShot(ang, false, null);
  }

  private castFlash(): void {
    if (this.flashCd > 0) return;
    this.flashCd = CONFIG.flashCd;
    this.blink(CONFIG.flashRange, 0xc9e8ff);
  }

  private castArcaneShift(): void {
    if (this.abilityCd > 0) return;
    this.abilityCd = this.champ.abilityCd;
    this.blink(400, 0xffe07a);
    const t = this.nearestEnemy();
    if (t) {
      const ang = Math.atan2(t.y - this.py, t.x - this.px);
      this.spawnPlayerShot(ang, true, t);
    }
  }

  private castTumble(): void {
    if (this.abilityCd > 0) return;
    this.abilityCd = this.champ.abilityCd;
    const p = this.pointer();
    const ang = Math.atan2(p.worldY - this.py, p.worldX - this.px);
    const d = 300;
    const nx = Phaser.Math.Clamp(this.px + Math.cos(ang) * d, CONFIG.playerRadius, this.scale.width - CONFIG.playerRadius);
    const ny = Phaser.Math.Clamp(this.py + Math.sin(ang) * d, CONFIG.playerRadius, this.scale.height - CONFIG.playerRadius);
    this.dash = { fx: this.px, fy: this.py, tx: nx, ty: ny, t: 0, dur: 0.16 };
    this.invuln = Math.max(this.invuln, 0.16);
    this.facing = ang;
  }

  private blink(range: number, color: number): void {
    const p = this.pointer();
    const ang = Math.atan2(p.worldY - this.py, p.worldX - this.px);
    const d = Math.min(range, Phaser.Math.Distance.Between(this.px, this.py, p.worldX, p.worldY));
    this.burst(this.px, this.py, 0xf0e6d2, 18, 1.2);
    this.px = Phaser.Math.Clamp(this.px + Math.cos(ang) * d, CONFIG.playerRadius, this.scale.width - CONFIG.playerRadius);
    this.py = Phaser.Math.Clamp(this.py + Math.sin(ang) * d, CONFIG.playerRadius, this.scale.height - CONFIG.playerRadius);
    this.tx = this.px; this.ty = this.py;
    this.invuln = Math.max(this.invuln, 0.12);
    this.burst(this.px, this.py, color, 22, 1.6);
  }

  private spawnPlayerShot(ang: number, homing: boolean, target: Enemy | null): void {
    const speed = homing ? 800 : CONFIG.basicSpeed;
    const img = this.add.image(this.px, this.py, "glow").setDepth(7);
    img.setTint(this.champ.accent).setDisplaySize(20, 20);
    this.playerShots.push({
      obj: img, x: this.px, y: this.py,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      r: 9, dmg: 0, color: this.champ.accent, style: "basic",
      life: 3, traveled: 0, range: homing ? 950 : CONFIG.basicRange,
      trail: [], homing, target, dead: false,
    });
  }

  private nearestEnemy(): Enemy | null {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Phaser.Math.Distance.Squared(this.px, this.py, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ---------------- Ellenség ----------------
  private spawnEnemy(): void {
    const W = this.scale.width, H = this.scale.height, m = 70;
    const edge = Phaser.Math.Between(0, 3);
    let x = 0, y = 0;
    if (edge === 0) { x = Phaser.Math.Between(m, W - m); y = m; }
    else if (edge === 1) { x = W - m; y = Phaser.Math.Between(m, H - m); }
    else if (edge === 2) { x = Phaser.Math.Between(m, W - m); y = H - m; }
    else { x = m; y = Phaser.Math.Between(m, H - m); }

    const def = ATTACKERS[this.spawnIndex % ATTACKERS.length];
    this.spawnIndex++;

    const obj = this.add.image(x, y, `token_${def.key}`).setDisplaySize(52, 52).setDepth(5).setScale(0.01);
    const label = this.add
      .text(x, y - 40, def.name, { fontFamily: "Trebuchet MS, sans-serif", fontSize: "12px", color: "#cfe3ff" })
      .setOrigin(0.5)
      .setDepth(5)
      .setAlpha(0.7);
    this.enemies.push({ obj, label, def, x, y, fireTimer: Phaser.Math.FloatBetween(1.0, 2.2), drift: Phaser.Math.FloatBetween(-1, 1), spawnT: 0, castT: 0, dead: false });
  }

  private enemyFire(e: Enemy): void {
    e.castT = 0.35;
    const s = e.def.shot;
    if (s.kind === "line") {
      const lead = 0.14;
      const targx = this.px + (this.tx - this.px) * lead;
      const targy = this.py + (this.ty - this.py) * lead;
      const ang = Math.atan2(targy - e.y, targx - e.x);
      const warn = Phaser.Math.Clamp(s.warn - (this.difficulty - 1) * 0.04, 0.3, s.warn);
      this.telegraphs.push({
        kind: "line", x: e.x, y: e.y, ang, width: s.width, length: s.length, radius: 0,
        warn, t: 0, dmg: s.dmg, color: s.color, style: s.style, done: false,
      });
    } else {
      const tx = Phaser.Math.Clamp(this.px + Phaser.Math.Between(-30, 30), 40, this.scale.width - 40);
      const ty = Phaser.Math.Clamp(this.py + Phaser.Math.Between(-30, 30), 40, this.scale.height - 40);
      this.lobs.push({ sx: e.x, sy: e.y, tx, ty, t: 0, dur: s.lob });
      this.telegraphs.push({
        kind: "circle", x: tx, y: ty, radius: s.radius, ang: 0, width: 0, length: 0,
        warn: s.lob, t: 0, dmg: s.dmg, color: s.color, style: s.style, done: false,
      });
    }
  }

  private fireLine(t: Telegraph): void {
    const img = this.add.image(t.x, t.y, "glow").setDepth(7).setTint(t.color);
    const elong = t.style === "ezreal" || t.style === "ashe";
    const w = t.width;
    img.setDisplaySize(elong ? w * 2.6 : w * 1.4, w * 1.4);
    img.setRotation(t.ang);
    const speed = t.style === "ezreal" ? 1150 : t.style === "ashe" ? 470 : t.style === "ryze" ? 720 : 820;
    this.enemyShots.push({
      obj: img, x: t.x, y: t.y,
      vx: Math.cos(t.ang) * (speed + (this.difficulty - 1) * 45),
      vy: Math.sin(t.ang) * (speed + (this.difficulty - 1) * 45),
      r: w * 0.5, dmg: t.dmg, color: t.color, style: t.style,
      life: 3.2, traveled: 0, range: 3000, trail: [], homing: false, target: null, dead: false,
    });
  }

  private explode(x: number, y: number, radius: number, dmg: number): void {
    this.burst(x, y, 0xff9a4a, 30, 3.8);
    this.particles.push({ x, y, vx: 0, vy: 0, r: 4, t: 0, dur: 0.38, color: 0xff9a4a, ring: true, maxR: radius });
    if (Phaser.Math.Distance.Squared(this.px, this.py, x, y) < (radius + CONFIG.playerRadius) ** 2) this.damage(dmg);
  }

  // ---------------- Sebzés / effektek ----------------
  private damage(amount: number): void {
    if (this.over || this.invuln > 0) return;
    this.hp -= amount;
    this.hitFlash = 0.25;
    this.burst(this.px, this.py, 0xe04a4a, 14, 1.4);
    this.floatText(this.px, this.py - 30, "-" + amount, "#ff6b6b");
    if (this.hp <= 0) { this.hp = 0; this.gameOver(); }
  }

  private burst(x: number, y: number, color: number, count: number, scale: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (40 + Math.random() * 200) * scale;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1.5 + Math.random() * 2, t: 0, dur: 0.3 + Math.random() * 0.4, color, ring: false, maxR: 0 });
    }
  }

  private ring(x: number, y: number, r: number, color: number): void {
    this.particles.push({ x, y, vx: 0, vy: 0, r: 2, t: 0, dur: 0.4, color, ring: true, maxR: r });
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y, text, { fontFamily: "Trebuchet MS, sans-serif", fontSize: "18px", fontStyle: "bold", color })
      .setOrigin(0.5)
      .setDepth(9);
    this.tweens.add({ targets: t, y: y - 26, alpha: 0, duration: 850, onComplete: () => t.destroy() });
  }

  // ---------------- Fő ciklus ----------------
  update(_time: number, deltaMs: number): void {
    if (this.over) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.elapsed += dt;
    this.score = Math.floor(this.elapsed * 10) + this.kills * 50;
    this.difficulty = 1 + this.elapsed / 22;

    this.waveTimer += dt;
    if (this.waveTimer >= 15) { this.waveTimer = 0; this.wave++; this.floatText(this.scale.width / 2, 100, "HULLÁM " + this.wave, "#c8aa6e"); }

    this.updatePlayer(dt);
    this.updateSpawns(dt);
    this.updateEnemies(dt);
    this.updateTelegraphs(dt);
    this.updateLobs(dt);
    this.updateEnemyShots(dt);
    this.updatePlayerShots(dt);
    this.updateParticles(dt);
    this.draw();
  }

  private updatePlayer(dt: number): void {
    this.flashCd = Math.max(0, this.flashCd - dt);
    this.basicCd = Math.max(0, this.basicCd - dt);
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);

    if (this.dash) {
      this.dash.t += dt;
      const k = Phaser.Math.Clamp(this.dash.t / this.dash.dur, 0, 1);
      const e = 1 - (1 - k) * (1 - k);
      this.px = this.dash.fx + (this.dash.tx - this.dash.fx) * e;
      this.py = this.dash.fy + (this.dash.ty - this.dash.fy) * e;
      this.ghosts.push({ x: this.px, y: this.py, t: 0 });
      if (k >= 1) { this.dash = null; this.tx = this.px; this.ty = this.py; }
    } else {
      const dx = this.tx - this.px, dy = this.ty - this.py, d = Math.hypot(dx, dy);
      if (d > 1) {
        const step = Math.min(d, CONFIG.playerSpeed * dt);
        this.px += (dx / d) * step; this.py += (dy / d) * step;
        this.facing = Math.atan2(dy, dx);
      }
    }
    this.px = Phaser.Math.Clamp(this.px, CONFIG.playerRadius, this.scale.width - CONFIG.playerRadius);
    this.py = Phaser.Math.Clamp(this.py, CONFIG.playerRadius, this.scale.height - CONFIG.playerRadius);
    this.hero.setPosition(this.px, this.py);
    this.hero.setTint(this.hitFlash > 0 ? 0xff8888 : 0xffffff);

    for (const g of this.ghosts) g.t += dt;
    this.ghosts = this.ghosts.filter((g) => g.t < 0.25);
  }

  private updateSpawns(dt: number): void {
    this.spawnTimer -= dt;
    const max = Math.min(3 + Math.floor(this.elapsed / 12), 9);
    if (this.spawnTimer <= 0 && this.enemies.length < max) {
      this.spawnEnemy();
      this.spawnTimer = Phaser.Math.FloatBetween(1.5, 3.0) / Math.sqrt(this.difficulty);
    }
  }

  private updateEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (e.spawnT < 1) { e.spawnT = Math.min(1, e.spawnT + dt * 3); e.obj.setScale((52 / 96) * e.spawnT); }
      if (e.castT > 0) e.castT = Math.max(0, e.castT - dt);
      e.x += e.drift * 16 * dt;
      e.y += Math.cos(this.elapsed + e.x) * 6 * dt;
      e.x = Phaser.Math.Clamp(e.x, 44, this.scale.width - 44);
      e.y = Phaser.Math.Clamp(e.y, 44, this.scale.height - 44);
      e.obj.setPosition(e.x, e.y);
      e.label.setPosition(e.x, e.y - 40);
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) { this.enemyFire(e); e.fireTimer = Phaser.Math.FloatBetween(1.7, 3.1) / this.difficulty; }
    }
    this.enemies = this.enemies.filter((e) => {
      if (e.dead) { e.obj.destroy(); e.label.destroy(); return false; }
      return true;
    });
  }

  private updateTelegraphs(dt: number): void {
    for (const t of this.telegraphs) {
      t.t += dt;
      if (t.t >= t.warn && !t.done) {
        t.done = true;
        if (t.kind === "line") this.fireLine(t);
        else this.explode(t.x, t.y, t.radius, t.dmg);
      }
    }
    this.telegraphs = this.telegraphs.filter((t) => !t.done);
  }

  private updateLobs(dt: number): void {
    for (const l of this.lobs) l.t += dt;
    this.lobs = this.lobs.filter((l) => l.t < l.dur);
  }

  private updateEnemyShots(dt: number): void {
    for (const s of this.enemyShots) {
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 7) s.trail.shift();
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      s.obj.setPosition(s.x, s.y);
      if (Phaser.Math.Distance.Squared(s.x, s.y, this.px, this.py) < (s.r + CONFIG.playerRadius) ** 2) {
        this.damage(s.dmg); s.dead = true; this.burst(s.x, s.y, s.color, 12, 1.2);
      }
      if (s.x < -80 || s.x > this.scale.width + 80 || s.y < -80 || s.y > this.scale.height + 80 || s.life <= 0) s.dead = true;
    }
    this.enemyShots = this.enemyShots.filter((s) => {
      if (s.dead) { s.obj.destroy(); return false; }
      return true;
    });
  }

  private updatePlayerShots(dt: number): void {
    for (const s of this.playerShots) {
      if (s.homing && s.target && !s.target.dead) {
        const desired = Math.atan2(s.target.y - s.y, s.target.x - s.x);
        const cur = Math.atan2(s.vy, s.vx);
        const na = cur + Phaser.Math.Angle.Wrap(desired - cur) * 0.18;
        const sp = Math.hypot(s.vx, s.vy);
        s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
      }
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 9) s.trail.shift();
      const dx = s.vx * dt, dy = s.vy * dt;
      s.x += dx; s.y += dy; s.traveled += Math.hypot(dx, dy);
      s.obj.setPosition(s.x, s.y);
      for (const e of this.enemies) {
        if (!e.dead && Phaser.Math.Distance.Squared(s.x, s.y, e.x, e.y) < (s.r + CONFIG.enemyRadius) ** 2) {
          e.dead = true; this.kills++;
          this.burst(e.x, e.y, e.def.ring, 28, 2.2);
          this.floatText(e.x, e.y - 26, "+50", "#0ac8b9");
          s.dead = true; break;
        }
      }
      if (s.traveled > s.range || s.x < -20 || s.x > this.scale.width + 20 || s.y < -20 || s.y > this.scale.height + 20) s.dead = true;
    }
    this.playerShots = this.playerShots.filter((s) => {
      if (s.dead) { s.obj.destroy(); return false; }
      return true;
    });
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      p.t += dt;
      if (p.ring) p.r = p.maxR * (p.t / p.dur);
      else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    }
    this.particles = this.particles.filter((p) => p.t < p.dur);
  }

  // ---------------- Rajz (graphics rétegek) ----------------
  private draw(): void {
    const g = this.gfxTele;
    g.clear();
    // telegraph-ok
    for (const t of this.telegraphs) {
      const k = Phaser.Math.Clamp(t.t / t.warn, 0, 1);
      if (t.kind === "line") {
        g.save();
        g.translateCanvas(t.x, t.y);
        g.rotateCanvas(t.ang);
        g.fillStyle(t.color, 0.08 + 0.12 * k);
        g.fillRect(0, -t.width / 2, t.length, t.width);
        g.fillStyle(t.color, 0.34 * k);
        g.fillRect(0, -t.width / 2, t.length * k, t.width);
        g.lineStyle(2, t.color, 0.5 + 0.4 * k);
        g.strokeRect(0, -t.width / 2, t.length, t.width);
        g.restore();
      } else {
        g.lineStyle(3, 0xff8c5a, 0.5 + 0.4 * k);
        g.strokeCircle(t.x, t.y, t.radius);
        g.fillStyle(0xff7846, 0.1 + 0.24 * k);
        g.fillCircle(t.x, t.y, t.radius * k);
      }
    }
    // Ziggs pattogó bomba
    for (const l of this.lobs) {
      const k = Phaser.Math.Clamp(l.t / l.dur, 0, 1);
      const x = l.sx + (l.tx - l.sx) * k;
      const yb = l.sy + (l.ty - l.sy) * k;
      const hop = Math.abs(Math.sin(k * Math.PI * 2)) * 46 * (1 - k * 0.4);
      const y = yb - hop;
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(x, yb, 20 * (1 - hop / 120), 8);
      g.fillStyle(0xff8a3a, 1);
      g.fillCircle(x, y, 10);
      g.fillStyle(0xffd08a, 1);
      g.fillCircle(x, y, 5);
    }

    // FX réteg: aurák, csóvák, részecskék
    const fx = this.gfxFx;
    fx.clear();

    // gurulás-szellemképek
    for (const gh of this.ghosts) {
      const a = 1 - gh.t / 0.25;
      fx.fillStyle(this.champ.accent, a * 0.35);
      fx.fillCircle(gh.x, gh.y, CONFIG.playerRadius);
    }

    // ellenség cast-villanás + játékos aura
    for (const e of this.enemies) {
      if (e.castT > 0) { fx.fillStyle(0xffffff, e.castT); fx.fillCircle(e.x, e.y, CONFIG.enemyRadius + 12); }
    }
    if (this.invuln > 0) { fx.lineStyle(2, 0xffffff, 0.6); fx.strokeCircle(this.px, this.py, CONFIG.playerRadius + 6); }

    // ellenség-lövedékek csóvái
    for (const s of this.enemyShots) this.drawTrail(fx, s);
    for (const s of this.playerShots) this.drawTrail(fx, s);

    // részecskék
    for (const p of this.particles) {
      const a = 1 - p.t / p.dur;
      if (p.ring) { fx.lineStyle(2, p.color, a); fx.strokeCircle(p.x, p.y, p.r); }
      else { fx.fillStyle(p.color, a); fx.fillCircle(p.x, p.y, p.r); }
    }

    // facing-jelző
    fx.fillStyle(0x0ac8b9, 0.9);
    const fx1 = this.px + Math.cos(this.facing) * (CONFIG.playerRadius + 4);
    const fy1 = this.py + Math.sin(this.facing) * (CONFIG.playerRadius + 4);
    fx.fillCircle(fx1, fy1, 4);
  }

  private drawTrail(fx: Phaser.GameObjects.Graphics, s: Shot): void {
    for (let i = 1; i < s.trail.length; i++) {
      const a = (i / s.trail.length) * 0.5;
      fx.lineStyle(s.r * (i / s.trail.length), s.color, a);
      fx.beginPath();
      fx.moveTo(s.trail[i - 1].x, s.trail[i - 1].y);
      fx.lineTo(s.trail[i].x, s.trail[i].y);
      fx.strokePath();
    }
  }

  // ---------------- Game over ----------------
  private gameOver(): void {
    this.over = true;
    const best = this.registry.get("best") as number;
    if (this.score > best) { this.registry.set("best", this.score); localStorage.setItem("riftdodge_best", String(this.score)); }

    const W = this.scale.width, H = this.scale.height, cx = W / 2;
    const dim = this.add.rectangle(cx, H / 2, W, H, 0x06090f, 0.75).setDepth(20);
    const panel = this.add.container(cx, H / 2).setDepth(21);
    const g = this.add.graphics();
    g.fillStyle(0x0a1420, 0.95); g.fillRoundedRect(-240, -180, 480, 360, 6);
    g.lineStyle(1, 0xc8aa6e, 0.5); g.strokeRoundedRect(-240, -180, 480, 360, 6);
    panel.add(g);
    panel.add(this.add.text(0, -140, "LEGYŐZTEK", { fontFamily: "Trebuchet MS, sans-serif", fontSize: "40px", fontStyle: "bold", color: "#ff8a8a" }).setOrigin(0.5));
    panel.add(this.add.text(0, -96, `Túlélted: ${this.elapsed.toFixed(1)} mp`, { fontFamily: "Trebuchet MS, sans-serif", fontSize: "16px", color: "#8899a6" }).setOrigin(0.5));
    const stats = `Pontszám  ${this.score}      Legjobb  ${this.registry.get("best")}      Kilövések  ${this.kills}`;
    panel.add(this.add.text(0, -40, stats, { fontFamily: "Trebuchet MS, sans-serif", fontSize: "15px", color: css(0xc8aa6e) }).setOrigin(0.5));

    const retry = button(this, cx, H / 2 + 60, "ÚJRA (ugyanaz a hős)", () => { dim.destroy(); panel.destroy(); this.scene.restart(); }, { width: 300 });
    retry.setDepth(22);
    const change = button(this, cx, H / 2 + 122, "HŐSVÁLTÁS", () => { dim.destroy(); panel.destroy(); this.scene.start("Select"); }, { ghost: true, width: 300 });
    change.setDepth(22);
  }
}
