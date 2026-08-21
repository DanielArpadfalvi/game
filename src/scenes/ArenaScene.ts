import Phaser from "phaser";
import { WinterBackground } from "../bg";
import { ATTACKERS, CHAMPIONS, CONFIG, ARENA, POWERUPS, POWER_ORDER, AttackerDef, ChampionDef, PowerKind } from "../data";
import { css } from "../helpers";
import { audio } from "../audio";
import { net } from "../net/net";

/* ---- Típusok ---- */
interface Bullet {
  obj: Phaser.GameObjects.Image;
  x: number; y: number; vx: number; vy: number;
  r: number; dmg: number; color: number; style: string;
  traveled: number; range: number; life: number;
  ownerId: string; homing: boolean; targetNpc: Npc | null;
  trail: { x: number; y: number }[]; dead: boolean;
}

interface Npc {
  id: string; key: string; def: AttackerDef;
  obj: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text;
  x: number; y: number; phase: number; dead: boolean;
  // csak a hostnál használt AI-mezők:
  drift: number; fireTimer: number; ultTimer: number; ulter: boolean; castT: number;
}

interface Telegraph {
  id: string; kind: "line" | "circle" | "beam";
  x: number; y: number; ang: number; width: number; length: number; radius: number;
  warn: number; t: number; dmg: number; color: number; style: string; mega: boolean;
  ownerId: string; done: boolean;
}
interface Beam { x: number; y: number; ang: number; width: number; length: number; t: number; dur: number; dmg: number; color: number; damaged: boolean; by: string; }
interface Lob { sx: number; sy: number; tx: number; ty: number; t: number; dur: number; mega: boolean; }
interface Particle { x: number; y: number; vx: number; vy: number; r: number; t: number; dur: number; color: number; ring: boolean; maxR: number; }
interface PowerToken { id: string; kind: PowerKind; x: number; y: number; obj: Phaser.GameObjects.Container; }

interface Remote {
  id: string; name: string; champ: string;
  x: number; y: number; tx: number; ty: number; fx: number; fy: number;
  hp: number; maxHp: number; alive: boolean; shield: number; invuln: boolean;
  upg: number; score: number;
  obj: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; seen: number;
}

const PLAYER_COLORS = [0x0ac8b9, 0xe8842e, 0xa26cff, 0x35c46a, 0xff6b8a, 0x4aa8e0, 0xe8d24a, 0xff8a3a];

export class ArenaScene extends Phaser.Scene {
  private champ!: ChampionDef;
  private hero!: Phaser.GameObjects.Image;
  private nameTag!: Phaser.GameObjects.Text;

  // helyi játékos állapot
  private px = 0; private py = 0; private tx = 0; private ty = 0; private facing = 0;
  private hp = CONFIG.maxHp; private maxHp = CONFIG.maxHp;
  private flashCd = 0; private abilityCd = 0; private fireCd = 0;
  private invuln = 0; private hitFlash = 0; private shield = 0;
  private upgLevel = 0; private upgTimer = 0;
  private dash: { fx: number; fy: number; tx: number; ty: number; t: number; dur: number } | null = null;
  private alive = true; private respawn = 0;
  private score = 0; private kills = 0; private deaths = 0;
  private ghosts: { x: number; y: number; t: number }[] = [];

  // hálózat / entitások
  private remotes = new Map<string, Remote>();
  private npcs = new Map<string, Npc>();
  private myShots: Bullet[] = [];
  private foeShots: Bullet[] = [];
  private telegraphs: Telegraph[] = [];
  private beams: Beam[] = [];
  private lobs: Lob[] = [];
  private particles: Particle[] = [];
  private powers = new Map<string, PowerToken>();
  private killfeed: { text: string; t: number }[] = [];

  // host időzítők
  private npcSpawnTimer = 1.0; private npcSnapTimer = 0; private puTimer = 4.0; private idc = 0;
  private stateTimer = 0; private elapsed = 0;

  private gfxTele!: Phaser.GameObjects.Graphics;
  private gfxFx!: Phaser.GameObjects.Graphics;
  private gfxAdd!: Phaser.GameObjects.Graphics;

  constructor() { super("Arena"); }

  /** HUD lekérdezés az ArenaUIScene-nek. */
  public getState() {
    const board = [
      { id: net.id, name: (this.registry.get("playerName") as string) || "Te", score: this.score, alive: this.alive, me: true },
      ...[...this.remotes.values()].map((r) => ({ id: r.id, name: r.name, score: r.score, alive: r.alive, me: false })),
    ].sort((a, b) => b.score - a.score);
    return {
      hp: this.hp, maxHp: this.maxHp, shield: this.shield,
      invuln: this.invuln, upg: this.upgLevel, upgTimer: this.upgTimer, upgMax: ARENA.upgradeDuration,
      ability: this.abilityCd, abilityMax: this.champ.abilityCd, abilityKey: this.champ.abilityKey, abilityName: this.champ.abilityName,
      flash: this.flashCd, flashMax: CONFIG.flashCd,
      alive: this.alive, respawn: this.respawn,
      board, killfeed: this.killfeed.map((k) => k.text),
    };
  }

  create(): void {
    this.resetState();
    new WinterBackground(this);
    const key = (this.registry.get("champ") as string) || "ezreal";
    this.champ = CHAMPIONS.find((c) => c.key === key)!;

    this.px = this.tx = this.scale.width / 2;
    this.py = this.ty = this.scale.height * 0.5;

    this.gfxTele = this.add.graphics().setDepth(1);
    this.hero = this.add.image(this.px, this.py, `hero_${this.champ.key}`).setDisplaySize(44, 44).setDepth(6);
    this.nameTag = this.add.text(this.px, this.py - 34, (this.registry.get("playerName") as string) || "Te",
      { fontFamily: "Trebuchet MS, sans-serif", fontSize: "12px", fontStyle: "bold", color: "#0ac8b9" }).setOrigin(0.5).setDepth(6);
    this.gfxFx = this.add.graphics().setDepth(8);
    this.gfxAdd = this.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);

    this.setupInput();
    this.setupNet();

    if (!this.scene.isActive("ArenaUI")) this.scene.launch("ArenaUI");
    this.scene.bringToTop("ArenaUI");

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop("ArenaUI"));

    // kezdeti állapot azonnal
    this.sendState(true);
  }

  private resetState(): void {
    this.remotes.clear(); this.npcs.clear(); this.powers.clear();
    this.myShots = []; this.foeShots = []; this.telegraphs = []; this.beams = []; this.lobs = [];
    this.particles = []; this.ghosts = []; this.killfeed = [];
    this.hp = this.maxHp = CONFIG.maxHp;
    this.flashCd = this.abilityCd = this.fireCd = 0;
    this.invuln = 2.0; this.hitFlash = 0; this.shield = 0; this.upgLevel = 0; this.upgTimer = 0;
    this.dash = null; this.alive = true; this.respawn = 0;
    this.score = 0; this.kills = 0; this.deaths = 0;
    this.npcSpawnTimer = 1.0; this.npcSnapTimer = 0; this.puTimer = 4.0; this.idc = 0;
    this.stateTimer = 0; this.elapsed = 0;
  }

  // ---------------- Input ----------------
  private setupInput(): void {
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      audio.ensure();
      if (!this.alive) return;
      // bal és jobb klikk is mozgat (a lövés automatikus)
      this.tx = Phaser.Math.Clamp(p.worldX, 0, this.scale.width);
      this.ty = Phaser.Math.Clamp(p.worldY, 0, this.scale.height);
      this.ring(this.tx, this.ty, 16, 0x0ac8b9);
    });
    const kb = this.input.keyboard!;
    kb.on("keydown", () => audio.ensure());
    kb.on("keydown-M", () => audio.toggleMute());
    kb.on("keydown-F", () => this.alive && this.castFlash());
    kb.on("keydown-" + this.champ.abilityKey.toUpperCase(), () => {
      if (!this.alive) return;
      if (this.champ.ability === "arcaneShift") this.castArcaneShift();
      else this.castTumble();
    });
    kb.on("keydown-ESC", () => this.leaveToLobby());
  }

  private leaveToLobby(): void {
    void net.leave();
    this.scene.start("Lobby");
  }

  // ---------------- Hálózati kötések ----------------
  private setupNet(): void {
    net.clearHandlers();
    net.onPresence((members) => {
      const ids = new Set(members.map((m) => m.id));
      // kilépett játékosok eltávolítása
      for (const [id, r] of this.remotes) {
        if (!ids.has(id)) { r.obj.destroy(); r.label.destroy(); this.remotes.delete(id); }
      }
      // új tagok felvétele (állapotukat majd a state hozza)
      for (const m of members) {
        if (m.id === net.id) continue;
        if (!this.remotes.has(m.id)) this.addRemote(m.id, m.name, m.champ);
      }
    });

    net.on("state", (p) => this.onState(p));
    net.on("pshot", (p) => this.onEnemyBullet(p, p._f));
    net.on("tele", (p) => this.onTele(p));
    net.on("npc", (p) => { if (!net.isHost()) this.onNpcSnapshot(p.list || []); });
    net.on("npcHit", (p) => { if (net.isHost()) this.hostNpcHit(p.nid, p._f); });
    net.on("npcDead", (p) => this.onNpcDead(p.nid, p.by));
    net.on("pu", (p) => { if (!net.isHost()) this.onPuSnapshot(p.list || []); });
    net.on("puGrab", (p) => { if (net.isHost()) this.hostPuGrab(p.pid, p._f); });
    net.on("puGone", (p) => this.onPuGone(p.pid, p.by, p.kind));
    net.on("died", (p) => this.onRemoteDied(p._f, p.by));
  }

  private addRemote(id: string, name: string, champ: string): void {
    const cdef = CHAMPIONS.find((c) => c.key === champ) ?? CHAMPIONS[0];
    const obj = this.add.image(this.scale.width / 2, this.scale.height / 2, `hero_${cdef.key}`).setDisplaySize(44, 44).setDepth(6);
    const label = this.add.text(0, 0, name, { fontFamily: "Trebuchet MS, sans-serif", fontSize: "12px", fontStyle: "bold", color: css(this.colorFor(id)) }).setOrigin(0.5).setDepth(6);
    this.remotes.set(id, {
      id, name, champ, x: this.scale.width / 2, y: this.scale.height / 2, tx: this.scale.width / 2, ty: this.scale.height / 2,
      fx: 1, fy: 0, hp: CONFIG.maxHp, maxHp: CONFIG.maxHp, alive: true, shield: 0, invuln: false, upg: 0, score: 0,
      obj, label, seen: this.elapsed,
    });
  }

  private colorFor(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return PLAYER_COLORS[h % PLAYER_COLORS.length];
  }

  private onState(p: any): void {
    let r = this.remotes.get(p._f);
    if (!r) { this.addRemote(p._f, p.name || "Játékos", p.champ || "ezreal"); r = this.remotes.get(p._f)!; }
    if (p.champ && p.champ !== r.champ) { r.champ = p.champ; r.obj.setTexture(`hero_${p.champ}`).setDisplaySize(44, 44); }
    r.name = p.name || r.name; r.label.setText(r.name);
    r.tx = p.x; r.ty = p.y; r.fx = p.fx; r.fy = p.fy;
    r.hp = p.hp; r.maxHp = p.maxHp; r.alive = !!p.alive;
    r.shield = p.shield || 0; r.invuln = !!p.invuln; r.upg = p.upg || 0; r.score = p.score || 0;
    r.seen = this.elapsed;
  }

  // ---------------- Képességek ----------------
  private castFlash(): void {
    if (this.flashCd > 0) return;
    this.flashCd = CONFIG.flashCd;
    this.blink(CONFIG.flashRange, 0xc9e8ff);
    audio.flash();
  }
  private castArcaneShift(): void {
    if (this.abilityCd > 0) return;
    this.abilityCd = this.champ.abilityCd;
    this.blink(400, 0xffe07a);
    audio.ezrealShift();
  }
  private castTumble(): void {
    if (this.abilityCd > 0) return;
    this.abilityCd = this.champ.abilityCd;
    const p = this.input.activePointer;
    const ang = Math.atan2(p.worldY - this.py, p.worldX - this.px);
    const d = 300;
    const nx = Phaser.Math.Clamp(this.px + Math.cos(ang) * d, CONFIG.playerRadius, this.scale.width - CONFIG.playerRadius);
    const ny = Phaser.Math.Clamp(this.py + Math.sin(ang) * d, CONFIG.playerRadius, this.scale.height - CONFIG.playerRadius);
    this.dash = { fx: this.px, fy: this.py, tx: nx, ty: ny, t: 0, dur: 0.16 };
    this.invuln = Math.max(this.invuln, 0.2);
    this.facing = ang;
    audio.tumble();
  }
  private blink(range: number, color: number): void {
    const p = this.input.activePointer;
    const ang = Math.atan2(p.worldY - this.py, p.worldX - this.px);
    const d = Math.min(range, Phaser.Math.Distance.Between(this.px, this.py, p.worldX, p.worldY));
    this.burst(this.px, this.py, 0xf0e6d2, 18, 1.2);
    this.px = Phaser.Math.Clamp(this.px + Math.cos(ang) * d, CONFIG.playerRadius, this.scale.width - CONFIG.playerRadius);
    this.py = Phaser.Math.Clamp(this.py + Math.sin(ang) * d, CONFIG.playerRadius, this.scale.height - CONFIG.playerRadius);
    this.tx = this.px; this.ty = this.py;
    this.invuln = Math.max(this.invuln, 0.15);
    this.burst(this.px, this.py, color, 22, 1.6);
  }

  // ---------------- Automata lövés ----------------
  private autoFire(dt: number): void {
    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.fireCd > 0) return;
    const target = this.nearestFoe(950);
    if (!target) return;
    const ang = Math.atan2(target.y - this.py, target.x - this.px);
    this.facing = ang;
    const L = this.upgLevel;
    const cd = ARENA.autoFireCd / (1 + 0.35 * L);
    const dmg = ARENA.pvpBasicDmg * (1 + 0.4 * L);
    const speed = CONFIG.basicSpeed * (1 + 0.12 * L);
    const count = 1 + L;               // több lövedék magasabb szinten
    const spread = 0.14;               // rad, szomszédos lövedékek közt
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * spread;
      this.fireBullet(ang + off, speed, dmg, CONFIG.basicRange, this.champ.accent, "basic");
    }
    this.fireCd = cd;
    audio.basic();
  }

  private fireBullet(ang: number, speed: number, dmg: number, range: number, color: number, style: string): void {
    const sid = net.id + "_" + (this.idc++);
    const img = this.add.image(this.px, this.py, "glow").setDepth(7).setTint(color).setDisplaySize(20, 20);
    this.myShots.push({
      obj: img, x: this.px, y: this.py, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      r: 9, dmg, color, style, traveled: 0, range, life: 3, ownerId: net.id, homing: false, targetNpc: null, trail: [], dead: false,
    });
    net.send("pshot", { sid, x: this.px, y: this.py, ang, speed, dmg, range, r: 9, color, style });
  }

  /** Ellenfél lövedéke (másik játékostól) — csak a saját avatárt sebzi. */
  private onEnemyBullet(p: any, from: string): void {
    const img = this.add.image(p.x, p.y, "glow").setDepth(7).setTint(p.color).setDisplaySize(20, 20);
    this.foeShots.push({
      obj: img, x: p.x, y: p.y, vx: Math.cos(p.ang) * p.speed, vy: Math.sin(p.ang) * p.speed,
      r: p.r || 9, dmg: p.dmg, color: p.color, style: p.style || "basic",
      traveled: 0, range: p.range || 800, life: 3, ownerId: from, homing: false, targetNpc: null, trail: [], dead: false,
    });
  }

  private nearestFoe(maxDist: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null, bd = maxDist * maxDist;
    for (const r of this.remotes.values()) {
      if (!r.alive) continue;
      const d = Phaser.Math.Distance.Squared(this.px, this.py, r.x, r.y);
      if (d < bd) { bd = d; best = { x: r.x, y: r.y }; }
    }
    for (const n of this.npcs.values()) {
      if (n.dead || n.phase < 0.6) continue;
      const d = Phaser.Math.Distance.Squared(this.px, this.py, n.x, n.y);
      if (d < bd) { bd = d; best = { x: n.x, y: n.y }; }
    }
    return best;
  }

  // ---------------- Fő ciklus ----------------
  update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.elapsed += dt;

    this.updatePlayer(dt);
    if (this.alive) this.autoFire(dt);
    this.updateRemotes(dt);
    if (net.isHost()) this.hostUpdate(dt);
    this.updateTelegraphs(dt);
    this.updateBeams(dt);
    this.updateLobs(dt);
    this.updateMyShots(dt);
    this.updateFoeShots(dt);
    this.updatePowers(dt);
    this.updateParticles(dt);
    this.updateKillfeed(dt);

    // állapot broadcast ~12 Hz
    this.stateTimer -= dt;
    if (this.stateTimer <= 0) { this.sendState(false); this.stateTimer = 1 / 12; }

    this.draw();
  }

  private sendState(force: boolean): void {
    net.send("state", {
      x: Math.round(this.px), y: Math.round(this.py),
      fx: Math.cos(this.facing), fy: Math.sin(this.facing),
      hp: Math.round(this.hp), maxHp: this.maxHp, alive: this.alive,
      shield: Math.round(this.shield), invuln: this.invuln > 0, upg: this.upgLevel, score: this.score,
      name: (this.registry.get("playerName") as string) || "Játékos", champ: this.champ.key, init: force,
    });
  }

  private updatePlayer(dt: number): void {
    this.flashCd = Math.max(0, this.flashCd - dt);
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.upgTimer > 0) { this.upgTimer = Math.max(0, this.upgTimer - dt); if (this.upgTimer === 0) this.upgLevel = 0; }

    if (!this.alive) {
      this.respawn -= dt;
      this.hero.setVisible(false); this.nameTag.setVisible(false);
      if (this.respawn <= 0) this.doRespawn();
      return;
    }
    this.hero.setVisible(true); this.nameTag.setVisible(true);

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
      if (d > 1) { const step = Math.min(d, CONFIG.playerSpeed * dt); this.px += (dx / d) * step; this.py += (dy / d) * step; }
    }
    this.px = Phaser.Math.Clamp(this.px, CONFIG.playerRadius, this.scale.width - CONFIG.playerRadius);
    this.py = Phaser.Math.Clamp(this.py, CONFIG.playerRadius, this.scale.height - CONFIG.playerRadius);
    this.hero.setPosition(this.px, this.py).setTint(this.hitFlash > 0 ? 0xff8888 : 0xffffff);
    this.nameTag.setPosition(this.px, this.py - 34);

    for (const g of this.ghosts) g.t += dt;
    this.ghosts = this.ghosts.filter((g) => g.t < 0.25);
  }

  private updateRemotes(dt: number): void {
    for (const r of this.remotes.values()) {
      // sima interpoláció a legutóbbi állapot felé
      r.x += (r.tx - r.x) * Math.min(1, dt * 12);
      r.y += (r.ty - r.y) * Math.min(1, dt * 12);
      r.obj.setPosition(r.x, r.y).setVisible(r.alive).setAlpha(r.invuln ? 0.6 : 1);
      r.label.setPosition(r.x, r.y - 34).setVisible(r.alive);
    }
  }

  // ---------------- Sebzés / halál / újraéledés ----------------
  private damage(amount: number, by: string): void {
    if (!this.alive || this.invuln > 0) return;
    let dmg = amount;
    if (this.shield > 0) { const ab = Math.min(this.shield, dmg); this.shield -= ab; dmg -= ab; }
    if (dmg > 0) { this.hp -= dmg; this.floatText(this.px, this.py - 30, "-" + Math.round(dmg), "#ff6b6b"); }
    this.hitFlash = 0.25;
    this.burst(this.px, this.py, 0xe04a4a, 12, 1.3);
    this.cameras.main.shake(70, 0.004);
    audio.hurt();
    if (this.hp <= 0) { this.hp = 0; this.die(by); }
  }

  private die(by: string): void {
    this.alive = false;
    this.deaths++;
    this.respawn = ARENA.respawnDelay;
    this.burst(this.px, this.py, 0xffffff, 30, 2.4);
    this.cameras.main.shake(180, 0.008);
    audio.death();
    net.send("died", { by });
    this.sendState(true);
  }

  private doRespawn(): void {
    this.alive = true;
    this.hp = this.maxHp; this.shield = 0; this.upgLevel = 0; this.upgTimer = 0;
    this.invuln = 2.5; this.dash = null;
    // középső, éltől távoli pont
    this.px = this.tx = Phaser.Math.Between(this.scale.width * 0.3, this.scale.width * 0.7);
    this.py = this.ty = Phaser.Math.Between(this.scale.height * 0.35, this.scale.height * 0.65);
    this.burst(this.px, this.py, 0x0ac8b9, 24, 2);
    this.sendState(true);
  }

  private onRemoteDied(victimId: string, killerId: string): void {
    const victim = this.remotes.get(victimId);
    if (victim) { victim.alive = false; this.burst(victim.x, victim.y, 0xffffff, 24, 2); }
    const vName = victim ? victim.name : "Valaki";
    const kName = this.nameOf(killerId);
    if (killerId === net.id) { this.kills++; this.score += 100; this.floatText(this.px, this.py - 44, "KILL +100", "#0ac8b9"); audio.kill(); }
    this.addKill(`${kName} ☠ ${vName}`);
  }

  private nameOf(id: string): string {
    if (id === net.id) return (this.registry.get("playerName") as string) || "Te";
    if (id === "npc") return "NPC";
    return this.remotes.get(id)?.name ?? "Játékos";
  }

  private addKill(text: string): void {
    this.killfeed.unshift({ text, t: 0 });
    if (this.killfeed.length > 5) this.killfeed.pop();
  }
  private updateKillfeed(dt: number): void {
    for (const k of this.killfeed) k.t += dt;
    this.killfeed = this.killfeed.filter((k) => k.t < 6);
  }

  // ---------------- Lövedékek ----------------
  private updateMyShots(dt: number): void {
    for (const s of this.myShots) {
      s.trail.push({ x: s.x, y: s.y }); if (s.trail.length > 9) s.trail.shift();
      const dx = s.vx * dt, dy = s.vy * dt; s.x += dx; s.y += dy; s.traveled += Math.hypot(dx, dy);
      s.obj.setPosition(s.x, s.y);
      // NPC találat (host-nak jelezzük)
      for (const n of this.npcs.values()) {
        if (n.dead || n.phase < 0.5) continue;
        if (Phaser.Math.Distance.Squared(s.x, s.y, n.x, n.y) < (s.r + CONFIG.enemyRadius) ** 2) {
          s.dead = true;
          this.burst(s.x, s.y, 0xffffff, 8, 1.2);
          if (net.isHost()) this.hostNpcHit(n.id, net.id);
          else net.send("npcHit", { nid: n.id });
          break;
        }
      }
      // kozmetikai eltűnés, ha ellenfelet talál (a sebzést a célpont dönti el)
      if (!s.dead) for (const r of this.remotes.values()) {
        if (r.alive && Phaser.Math.Distance.Squared(s.x, s.y, r.x, r.y) < (s.r + CONFIG.playerRadius) ** 2) {
          s.dead = true; this.burst(s.x, s.y, s.color, 6, 1); break;
        }
      }
      if (s.traveled > s.range || s.x < -20 || s.x > this.scale.width + 20 || s.y < -20 || s.y > this.scale.height + 20) s.dead = true;
    }
    this.myShots = this.myShots.filter((s) => { if (s.dead) { s.obj.destroy(); return false; } return true; });
  }

  private updateFoeShots(dt: number): void {
    for (const s of this.foeShots) {
      s.trail.push({ x: s.x, y: s.y }); if (s.trail.length > 7) s.trail.shift();
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; s.obj.setPosition(s.x, s.y);
      if (this.alive && Phaser.Math.Distance.Squared(s.x, s.y, this.px, this.py) < (s.r + CONFIG.playerRadius) ** 2) {
        this.damage(s.dmg, s.ownerId); s.dead = true; this.burst(s.x, s.y, s.color, 10, 1.2); audio.impact(s.style);
      }
      if (s.x < -80 || s.x > this.scale.width + 80 || s.y < -80 || s.y > this.scale.height + 80 || s.life <= 0) s.dead = true;
    }
    this.foeShots = this.foeShots.filter((s) => { if (s.dead) { s.obj.destroy(); return false; } return true; });
  }

  // ---------------- Telegráf → lövés / robbanás ----------------
  private onTele(p: any): void {
    this.telegraphs.push({
      id: p.tid, kind: p.kind, x: p.x, y: p.y, ang: p.ang || 0,
      width: p.width || 0, length: p.length || 0, radius: p.radius || 0,
      warn: p.warn, t: 0, dmg: p.dmg, color: p.color, style: p.style, mega: !!p.mega, ownerId: p._f || "npc", done: false,
    });
    audio.cast(p.style);
  }

  private updateTelegraphs(dt: number): void {
    for (const t of this.telegraphs) {
      t.t += dt;
      if (t.t >= t.warn && !t.done) {
        t.done = true;
        if (t.kind === "line") this.spawnTeleLine(t);
        else if (t.kind === "beam") this.activateBeam(t);
        else this.explode(t.x, t.y, t.radius, t.dmg, t.mega, t.ownerId);
      }
    }
    this.telegraphs = this.telegraphs.filter((t) => !t.done);
  }

  private spawnTeleLine(t: Telegraph): void {
    const img = this.add.image(t.x, t.y, "glow").setDepth(7).setTint(t.color);
    const elong = t.style === "ezreal" || t.style === "ashe";
    const w = t.width; img.setDisplaySize(elong ? w * 2.6 : w * 1.4, w * 1.4).setRotation(t.ang);
    const speed = t.style === "ezreal" ? 1150 : t.style === "ashe" ? 470 : t.style === "ryze" ? 720 : 820;
    this.foeShots.push({
      obj: img, x: t.x, y: t.y, vx: Math.cos(t.ang) * speed, vy: Math.sin(t.ang) * speed,
      r: w * 0.5, dmg: t.dmg, color: t.color, style: t.style, traveled: 0, range: 3000, life: 3.2,
      ownerId: t.ownerId, homing: false, targetNpc: null, trail: [], dead: false,
    });
  }

  private activateBeam(t: Telegraph): void {
    this.beams.push({ x: t.x, y: t.y, ang: t.ang, width: t.width, length: t.length, t: 0, dur: 0.3, dmg: t.dmg, color: t.color, damaged: false, by: t.ownerId });
    this.cameras.main.flash(160, 255, 250, 210);
    this.cameras.main.shake(140, 0.005);
    audio.luxBeam();
    this.burst(t.x, t.y, 0xffffff, 22, 2);
  }

  private explode(x: number, y: number, radius: number, dmg: number, mega: boolean, by: string): void {
    const color = mega ? 0xff7a2a : 0xff9a4a;
    this.burst(x, y, color, mega ? 55 : 28, mega ? 5 : 3.6);
    this.particles.push({ x, y, vx: 0, vy: 0, r: 4, t: 0, dur: mega ? 0.55 : 0.38, color, ring: true, maxR: radius });
    if (mega) { this.cameras.main.shake(300, 0.016); this.cameras.main.flash(140, 255, 150, 70); audio.ziggsBoom(); }
    else { this.cameras.main.shake(110, 0.005); audio.impact("ziggs"); }
    if (this.alive && Phaser.Math.Distance.Squared(this.px, this.py, x, y) < (radius + CONFIG.playerRadius) ** 2) this.damage(dmg, by);
  }

  private updateBeams(dt: number): void {
    for (const b of this.beams) {
      b.t += dt;
      if (!b.damaged && this.alive) {
        const dx = this.px - b.x, dy = this.py - b.y;
        const along = dx * Math.cos(b.ang) + dy * Math.sin(b.ang);
        const perp = -dx * Math.sin(b.ang) + dy * Math.cos(b.ang);
        if (along > -20 && along < b.length && Math.abs(perp) < b.width / 2 + CONFIG.playerRadius) { b.damaged = true; this.damage(b.dmg, b.by); }
      }
    }
    this.beams = this.beams.filter((b) => b.t < b.dur);
  }
  private updateLobs(dt: number): void { for (const l of this.lobs) l.t += dt; this.lobs = this.lobs.filter((l) => l.t < l.dur); }

  // ---------------- Power-upok ----------------
  private onPuSnapshot(list: any[]): void {
    const ids = new Set(list.map((p) => p.id));
    for (const [id, tok] of this.powers) if (!ids.has(id)) { tok.obj.destroy(); this.powers.delete(id); }
    for (const p of list) if (!this.powers.has(p.id)) this.spawnPowerToken(p.id, p.kind, p.x, p.y);
  }

  private spawnPowerToken(id: string, kind: PowerKind, x: number, y: number): void {
    const def = POWERUPS[kind];
    const c = this.add.container(x, y).setDepth(4);
    const g = this.add.graphics();
    g.fillStyle(0x0a1420, 0.85); g.fillCircle(0, 0, ARENA.powerRadius + 4);
    g.lineStyle(2, def.color, 1); g.strokeCircle(0, 0, ARENA.powerRadius + 4);
    const t = this.add.text(0, 0, def.glyph, { fontFamily: "Trebuchet MS, sans-serif", fontSize: "20px", fontStyle: "bold", color: css(def.color) }).setOrigin(0.5);
    c.add([g, t]);
    this.tweens.add({ targets: c, scale: { from: 0.85, to: 1.1 }, duration: 800, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.powers.set(id, { id, kind, x, y, obj: c });
  }

  private updatePowers(_dt: number): void {
    if (!this.alive) return;
    for (const tok of this.powers.values()) {
      if (Phaser.Math.Distance.Squared(this.px, this.py, tok.x, tok.y) < (ARENA.powerRadius + CONFIG.playerRadius) ** 2) {
        if (net.isHost()) this.hostPuGrab(tok.id, net.id);
        else net.send("puGrab", { pid: tok.id });
        // helyi optimista eltüntetés, hogy ne spammeljünk
        tok.obj.setVisible(false);
      }
    }
  }

  private applyPower(kind: PowerKind): void {
    const def = POWERUPS[kind];
    if (kind === "shield") this.shield = Math.min(120, this.shield + ARENA.shieldAmount);
    else if (kind === "invuln") this.invuln = Math.max(this.invuln, ARENA.invulnDuration);
    else { this.upgLevel = Math.min(ARENA.upgradeMaxLevel, this.upgLevel + 1); this.upgTimer = ARENA.upgradeDuration; }
    this.floatText(this.px, this.py - 46, def.name + "!", css(def.color));
    this.burst(this.px, this.py, def.color, 22, 2);
    audio.kill();
  }

  private onPuGone(pid: string, by: string, kind: PowerKind): void {
    const tok = this.powers.get(pid);
    if (tok) { this.burst(tok.x, tok.y, POWERUPS[kind].color, 16, 1.6); tok.obj.destroy(); this.powers.delete(pid); }
    if (by === net.id) this.applyPower(kind);
  }

  // ---------------- HOST: NPC + power-up szimuláció ----------------
  private hostUpdate(dt: number): void {
    // NPC spawn
    this.npcSpawnTimer -= dt;
    const alivePlayers = 1 + [...this.remotes.values()].filter((r) => r.alive).length;
    const maxNpc = Math.min(3 + alivePlayers, 8);
    if (this.npcSpawnTimer <= 0 && this.countNpcs() < maxNpc) {
      this.hostSpawnNpc();
      this.npcSpawnTimer = Phaser.Math.FloatBetween(1.6, 3.0);
    }
    // NPC AI
    for (const n of this.npcs.values()) {
      if (n.dead) continue;
      if (n.phase < 1) n.phase = Math.min(1, n.phase + dt * 3);
      if (n.castT > 0) n.castT = Math.max(0, n.castT - dt);
      n.x += n.drift * 16 * dt; n.y += Math.cos(this.elapsed + n.x) * 6 * dt;
      n.x = Phaser.Math.Clamp(n.x, 44, this.scale.width - 44); n.y = Phaser.Math.Clamp(n.y, 44, this.scale.height - 44);
      if (n.phase >= 1) {
        n.ultTimer -= dt;
        if (n.ulter && n.ultTimer <= 0) { this.hostNpcUlt(n); n.ultTimer = Phaser.Math.FloatBetween(8, 12); n.fireTimer = Math.max(n.fireTimer, 1.4); }
        else { n.fireTimer -= dt; if (n.fireTimer <= 0) { this.hostNpcFire(n); n.fireTimer = Phaser.Math.FloatBetween(1.8, 3.2); } }
      }
    }
    // NPC pozíció-snapshot ~8 Hz
    this.npcSnapTimer -= dt;
    if (this.npcSnapTimer <= 0) {
      this.npcSnapTimer = 1 / 8;
      const list = [...this.npcs.values()].filter((n) => !n.dead).map((n) => ({ id: n.id, key: n.key, x: Math.round(n.x), y: Math.round(n.y), phase: Math.round(n.phase * 100) / 100 }));
      net.send("npc", { list });
      // host maga is frissíti a sajátjai vizuálját
      for (const n of this.npcs.values()) this.placeNpc(n);
    }
    // power-up spawn
    this.puTimer -= dt;
    if (this.puTimer <= 0 && this.powers.size < ARENA.powerupMax) {
      this.hostSpawnPower();
      this.puTimer = ARENA.powerupInterval;
    }
  }

  private countNpcs(): number { let c = 0; for (const n of this.npcs.values()) if (!n.dead) c++; return c; }

  private allPlayerPositions(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    if (this.alive) out.push({ x: this.px, y: this.py });
    for (const r of this.remotes.values()) if (r.alive) out.push({ x: r.x, y: r.y });
    return out;
  }

  private hostSpawnNpc(): void {
    const W = this.scale.width, H = this.scale.height, m = 70;
    const edge = Phaser.Math.Between(0, 3);
    let x = 0, y = 0;
    if (edge === 0) { x = Phaser.Math.Between(m, W - m); y = m; }
    else if (edge === 1) { x = W - m; y = Phaser.Math.Between(m, H - m); }
    else if (edge === 2) { x = Phaser.Math.Between(m, W - m); y = H - m; }
    else { x = m; y = Phaser.Math.Between(m, H - m); }
    const def = ATTACKERS[this.idc % ATTACKERS.length];
    const id = "n" + net.id.slice(0, 3) + (this.idc++);
    const ulter = def.key === "lux" || def.key === "ziggs";
    const n: Npc = {
      id, key: def.key, def, obj: this.makeNpcObj(def.key, x, y), label: this.makeNpcLabel(def.name, x, y),
      x, y, phase: 0.01, dead: false,
      drift: Phaser.Math.FloatBetween(-1, 1), fireTimer: Phaser.Math.FloatBetween(1.0, 2.2),
      ultTimer: ulter ? Phaser.Math.FloatBetween(4.5, 7.5) : Infinity, ulter, castT: 0,
    };
    this.npcs.set(id, n);
  }

  private hostNpcFire(n: Npc): void {
    const players = this.allPlayerPositions();
    if (!players.length) return;
    const target = players[Phaser.Math.Between(0, players.length - 1)];
    n.castT = 0.35;
    const s = n.def.shot;
    const tid = "t" + (this.idc++);
    if (s.kind === "line") {
      const ang = Math.atan2(target.y - n.y, target.x - n.x);
      const tele = { tid, kind: "line", x: n.x, y: n.y, ang, width: s.width, length: s.length, radius: 0, warn: s.warn, dmg: s.dmg, color: s.color, style: s.style, mega: false };
      this.onTele({ ...tele, _f: "npc" }); net.send("tele", tele);
    } else {
      const tx = Phaser.Math.Clamp(target.x, 40, this.scale.width - 40);
      const ty = Phaser.Math.Clamp(target.y, 40, this.scale.height - 40);
      const tele = { tid, kind: "circle", x: tx, y: ty, ang: 0, width: 0, length: 0, radius: s.radius, warn: s.lob, dmg: s.dmg, color: s.color, style: s.style, mega: false };
      this.lobs.push({ sx: n.x, sy: n.y, tx, ty, t: 0, dur: s.lob, mega: false });
      this.onTele({ ...tele, _f: "npc" }); net.send("tele", tele);
    }
  }

  private hostNpcUlt(n: Npc): void {
    const players = this.allPlayerPositions();
    if (!players.length) return;
    const target = players[Phaser.Math.Between(0, players.length - 1)];
    n.castT = 0.6;
    const tid = "t" + (this.idc++);
    if (n.key === "lux") {
      const ang = Math.atan2(target.y - n.y, target.x - n.x);
      const tele = { tid, kind: "beam", x: n.x, y: n.y, ang, width: 82, length: 3200, radius: 0, warn: 0.72, dmg: 34, color: 0xfff3a0, style: "luxUlt", mega: true };
      this.onTele({ ...tele, _f: "npc" }); net.send("tele", tele); audio.luxCharge(0.72);
    } else {
      const tx = Phaser.Math.Clamp(target.x, 60, this.scale.width - 60);
      const ty = Phaser.Math.Clamp(target.y, 60, this.scale.height - 60);
      const tele = { tid, kind: "circle", x: tx, y: ty, ang: 0, width: 0, length: 0, radius: 156, warn: 1.05, dmg: 42, color: 0xff8a3a, style: "ziggsUlt", mega: true };
      this.lobs.push({ sx: n.x, sy: n.y - 140, tx, ty, t: 0, dur: 1.05, mega: true });
      this.onTele({ ...tele, _f: "npc" }); net.send("tele", tele); audio.ziggsWhistle(1.05);
    }
  }

  private hostNpcHit(nid: string, by: string): void {
    const n = this.npcs.get(nid);
    if (!n || n.dead) return;
    n.dead = true;
    net.send("npcDead", { nid, by });
    this.onNpcDead(nid, by);
  }

  private hostSpawnPower(): void {
    const kind = POWER_ORDER[Phaser.Math.Between(0, POWER_ORDER.length - 1)];
    const x = Phaser.Math.Between(this.scale.width * 0.2, this.scale.width * 0.8);
    const y = Phaser.Math.Between(this.scale.height * 0.25, this.scale.height * 0.75);
    const id = "p" + (this.idc++);
    this.spawnPowerToken(id, kind, x, y);
    this.broadcastPowers();
  }

  private broadcastPowers(): void {
    const list = [...this.powers.values()].map((p) => ({ id: p.id, kind: p.kind, x: Math.round(p.x), y: Math.round(p.y) }));
    net.send("pu", { list });
  }

  private hostPuGrab(pid: string, by: string): void {
    const tok = this.powers.get(pid);
    if (!tok) return;
    const kind = tok.kind;
    net.send("puGone", { pid, by, kind });
    this.onPuGone(pid, by, kind);
  }

  // ---------------- NPC vizuál (minden kliens) ----------------
  private makeNpcObj(key: string, x: number, y: number): Phaser.GameObjects.Image {
    return this.add.image(x, y, `token_${key}`).setDisplaySize(52, 52).setDepth(5);
  }
  private makeNpcLabel(name: string, x: number, y: number): Phaser.GameObjects.Text {
    return this.add.text(x, y - 40, name, { fontFamily: "Trebuchet MS, sans-serif", fontSize: "12px", color: "#cfe3ff" }).setOrigin(0.5).setDepth(5).setAlpha(0.7);
  }
  private placeNpc(n: Npc): void {
    n.obj.setPosition(n.x, n.y).setScale((52 / 96) * Math.max(0.05, n.phase));
    n.label.setPosition(n.x, n.y - 40);
  }

  private onNpcSnapshot(list: any[]): void {
    const ids = new Set(list.map((p) => p.id));
    for (const [id, n] of this.npcs) if (!ids.has(id)) { n.obj.destroy(); n.label.destroy(); this.npcs.delete(id); }
    for (const p of list) {
      let n = this.npcs.get(p.id);
      const def = ATTACKERS.find((a) => a.key === p.key) ?? ATTACKERS[0];
      if (!n) {
        n = { id: p.id, key: p.key, def, obj: this.makeNpcObj(p.key, p.x, p.y), label: this.makeNpcLabel(def.name, p.x, p.y), x: p.x, y: p.y, phase: p.phase, dead: false, drift: 0, fireTimer: 0, ultTimer: Infinity, ulter: false, castT: 0 };
        this.npcs.set(p.id, n);
      }
      n.x = p.x; n.y = p.y; n.phase = p.phase; this.placeNpc(n);
    }
  }

  private onNpcDead(nid: string, by: string): void {
    const n = this.npcs.get(nid);
    if (n) { this.burst(n.x, n.y, n.def.ring, 26, 2.2); n.obj.destroy(); n.label.destroy(); this.npcs.delete(nid); }
    if (by === net.id) { this.kills++; this.score += 50; this.floatText(this.px, this.py - 30, "+50", "#0ac8b9"); audio.kill(); }
  }

  // ---------------- FX segédek ----------------
  private burst(x: number, y: number, color: number, count: number, scale: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2; const s = (40 + Math.random() * 200) * scale;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1.5 + Math.random() * 2.5, t: 0, dur: 0.3 + Math.random() * 0.45, color, ring: false, maxR: 0 });
    }
  }
  private ring(x: number, y: number, r: number, color: number): void { this.particles.push({ x, y, vx: 0, vy: 0, r: 2, t: 0, dur: 0.4, color, ring: true, maxR: r }); }
  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y, text, { fontFamily: "Trebuchet MS, sans-serif", fontSize: "18px", fontStyle: "bold", color }).setOrigin(0.5).setDepth(9);
    this.tweens.add({ targets: t, y: y - 26, alpha: 0, duration: 850, onComplete: () => t.destroy() });
  }
  private updateParticles(dt: number): void {
    for (const p of this.particles) { p.t += dt; if (p.ring) p.r = p.maxR * (p.t / p.dur); else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; } }
    this.particles = this.particles.filter((p) => p.t < p.dur);
  }

  // ---------------- Rajz ----------------
  private draw(): void {
    const g = this.gfxTele; g.clear();
    for (const t of this.telegraphs) {
      const k = Phaser.Math.Clamp(t.t / t.warn, 0, 1);
      if (t.kind === "line") {
        g.save(); g.translateCanvas(t.x, t.y); g.rotateCanvas(t.ang);
        g.fillStyle(t.color, 0.08 + 0.12 * k); g.fillRect(0, -t.width / 2, t.length, t.width);
        g.fillStyle(t.color, 0.34 * k); g.fillRect(0, -t.width / 2, t.length * k, t.width);
        g.lineStyle(2, t.color, 0.5 + 0.4 * k); g.strokeRect(0, -t.width / 2, t.length, t.width); g.restore();
      } else if (t.kind === "beam") {
        g.save(); g.translateCanvas(t.x, t.y); g.rotateCanvas(t.ang);
        const coreW = 2 + k * (t.width * 0.5);
        g.fillStyle(0xffffff, 0.3 + 0.6 * k); g.fillRect(0, -coreW / 2, t.length, coreW);
        g.fillStyle(t.color, 0.12 + 0.25 * k); g.fillRect(0, -t.width / 2, t.length, t.width); g.restore();
      } else {
        const megaCol = t.mega ? 0xff6a2a : 0xff8c5a;
        g.lineStyle(t.mega ? 4 : 3, megaCol, 0.5 + 0.4 * k); g.strokeCircle(t.x, t.y, t.radius);
        g.fillStyle(t.mega ? 0xff5a20 : 0xff7846, 0.1 + 0.24 * k); g.fillCircle(t.x, t.y, t.radius * k);
      }
    }
    for (const l of this.lobs) {
      const k = Phaser.Math.Clamp(l.t / l.dur, 0, 1);
      const x = l.sx + (l.tx - l.sx) * k; const yb = l.sy + (l.ty - l.sy) * k;
      const hop = Math.abs(Math.sin(k * Math.PI * (l.mega ? 1 : 2))) * (l.mega ? 120 : 46) * (1 - k * 0.35);
      const y = yb - hop; const rad = l.mega ? 18 : 10;
      g.fillStyle(0x000000, 0.3); g.fillEllipse(x, yb, rad * 2 * (1 - hop / 200), rad * 0.7);
      g.fillStyle(0xff8a3a, 1); g.fillCircle(x, y, rad); g.fillStyle(0xffd08a, 1); g.fillCircle(x, y, rad * 0.5);
    }

    const fx = this.gfxFx; fx.clear();
    for (const gh of this.ghosts) { const a = 1 - gh.t / 0.25; fx.fillStyle(this.champ.accent, a * 0.35); fx.fillCircle(gh.x, gh.y, CONFIG.playerRadius); }
    // helyi játékos gyűrűk
    if (this.alive) {
      fx.lineStyle(2.5, 0x0ac8b9, 0.9); fx.strokeCircle(this.px, this.py, CONFIG.playerRadius + 6);
      if (this.shield > 0) { fx.lineStyle(3, 0x4aa8e0, 0.8); fx.strokeCircle(this.px, this.py, CONFIG.playerRadius + 11); }
      if (this.invuln > 0) { fx.lineStyle(2, 0xffe07a, 0.9); fx.strokeCircle(this.px, this.py, CONFIG.playerRadius + 15); }
      if (this.upgLevel > 0) { fx.lineStyle(2, 0x0ac8b9, 0.7); fx.strokeCircle(this.px, this.py, CONFIG.playerRadius + 19); }
      fx.fillStyle(0x0ac8b9, 0.9);
      fx.fillCircle(this.px + Math.cos(this.facing) * (CONFIG.playerRadius + 4), this.py + Math.sin(this.facing) * (CONFIG.playerRadius + 4), 4);
    }
    // távoli játékosok gyűrűi + HP mini-sáv
    for (const r of this.remotes.values()) {
      if (!r.alive) continue;
      const col = this.colorFor(r.id);
      fx.lineStyle(2.5, col, 0.9); fx.strokeCircle(r.x, r.y, CONFIG.playerRadius + 6);
      if (r.shield > 0) { fx.lineStyle(3, 0x4aa8e0, 0.7); fx.strokeCircle(r.x, r.y, CONFIG.playerRadius + 11); }
      if (r.invuln) { fx.lineStyle(2, 0xffe07a, 0.8); fx.strokeCircle(r.x, r.y, CONFIG.playerRadius + 15); }
      const bw = 40, pct = Phaser.Math.Clamp(r.hp / r.maxHp, 0, 1);
      fx.fillStyle(0x000000, 0.5); fx.fillRect(r.x - bw / 2, r.y + 26, bw, 5);
      fx.fillStyle(pct > 0.5 ? 0x35c46a : pct > 0.25 ? 0xd8be3c : 0xd8443c, 1); fx.fillRect(r.x - bw / 2, r.y + 26, bw * pct, 5);
    }
    for (const n of this.npcs.values()) if (n.castT > 0) { fx.fillStyle(0xffffff, Math.min(1, n.castT)); fx.fillCircle(n.x, n.y, CONFIG.enemyRadius + 12); }
    for (const s of this.foeShots) this.drawTrail(fx, s);
    for (const s of this.myShots) this.drawTrail(fx, s);
    for (const p of this.particles) { const a = 1 - p.t / p.dur; if (p.ring) { fx.lineStyle(p.maxR > 120 ? 4 : 2, p.color, a); fx.strokeCircle(p.x, p.y, p.r); } else { fx.fillStyle(p.color, a); fx.fillCircle(p.x, p.y, p.r); } }

    const add = this.gfxAdd; add.clear();
    for (const b of this.beams) {
      const life = 1 - b.t / b.dur; add.save(); add.translateCanvas(b.x, b.y); add.rotateCanvas(b.ang);
      add.fillStyle(b.color, 0.5 * life); add.fillRect(0, -b.width / 2, b.length, b.width);
      add.fillStyle(0xfff6c0, 0.7 * life); add.fillRect(0, -b.width * 0.28, b.length, b.width * 0.56);
      add.fillStyle(0xffffff, 0.95 * life); add.fillRect(0, -b.width * 0.1, b.length, b.width * 0.2); add.restore();
    }
  }

  private drawTrail(fx: Phaser.GameObjects.Graphics, s: Bullet): void {
    for (let i = 1; i < s.trail.length; i++) {
      const a = (i / s.trail.length) * 0.5; fx.lineStyle(s.r * (i / s.trail.length), s.color, a);
      fx.beginPath(); fx.moveTo(s.trail[i - 1].x, s.trail[i - 1].y); fx.lineTo(s.trail[i].x, s.trail[i].y); fx.strokePath();
    }
  }
}
