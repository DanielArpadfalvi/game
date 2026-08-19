import Phaser from "phaser";
import type { GameScene } from "./GameScene";

/** Felül futó HUD: pontszám, hullám, HP-sáv, képesség-cooldownok. */
export class UIScene extends Phaser.Scene {
  private gs!: GameScene;
  private g!: Phaser.GameObjects.Graphics;
  private tScore!: Phaser.GameObjects.Text;
  private tWave!: Phaser.GameObjects.Text;
  private tBest!: Phaser.GameObjects.Text;
  private tHp!: Phaser.GameObjects.Text;
  private abBasic!: Phaser.GameObjects.Text;
  private abAbility!: Phaser.GameObjects.Text;
  private abFlash!: Phaser.GameObjects.Text;
  private abBasicName!: Phaser.GameObjects.Text;
  private abAbilityName!: Phaser.GameObjects.Text;
  private abFlashName!: Phaser.GameObjects.Text;

  constructor() {
    super("UI");
  }

  create(): void {
    this.gs = this.scene.get("Game") as GameScene;
    this.g = this.add.graphics();

    const label = (t: string, x: number) =>
      this.add.text(x, 14, t, { fontFamily: "Trebuchet MS, sans-serif", fontSize: "10px", color: "#7f8c99" }).setOrigin(0.5, 0);
    const value = (x: number) =>
      this.add.text(x, 26, "0", { fontFamily: "Trebuchet MS, sans-serif", fontSize: "26px", fontStyle: "bold", color: "#f0e6d2" }).setOrigin(0.5, 0);

    const cx = this.scale.width / 2;
    label("PONTSZÁM", cx - 120); this.tScore = value(cx - 120);
    label("HULLÁM", cx); this.tWave = value(cx);
    label("LEGJOBB", cx + 120); this.tBest = value(cx + 120);

    this.tHp = this.add.text(0, 0, "", { fontFamily: "Trebuchet MS, sans-serif", fontSize: "12px", fontStyle: "bold", color: "#ffffff" }).setOrigin(0.5);

    const keyStyle = { fontFamily: "Trebuchet MS, sans-serif", fontSize: "15px", fontStyle: "bold", color: "#f0e6d2" };
    const nameStyle = { fontFamily: "Trebuchet MS, sans-serif", fontSize: "9px", color: "#8899a6" };
    this.abBasic = this.add.text(0, 0, "◱", keyStyle).setOrigin(0.5);
    this.abAbility = this.add.text(0, 0, "E", keyStyle).setOrigin(0.5);
    this.abFlash = this.add.text(0, 0, "F", keyStyle).setOrigin(0.5);
    this.abBasicName = this.add.text(0, 0, "Alaptám.", nameStyle).setOrigin(0.5);
    this.abAbilityName = this.add.text(0, 0, "Skill", nameStyle).setOrigin(0.5);
    this.abFlashName = this.add.text(0, 0, "Flash", nameStyle).setOrigin(0.5);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this));
  }

  private layout(): void {
    const cx = this.scale.width / 2;
    this.tScore.setX(cx - 120); this.tWave.setX(cx); this.tBest.setX(cx + 120);
  }

  update(): void {
    if (!this.gs || !this.scene.isActive("Game")) return;
    const s = this.gs.getStats();
    const W = this.scale.width, H = this.scale.height, cx = W / 2;

    this.tScore.setText(String(s.score));
    this.tWave.setText(String(s.wave));
    this.tBest.setText(String(s.best));
    this.abAbility.setText(s.abilityKey);
    this.abAbilityName.setText(s.abilityName.length > 12 ? s.abilityName.slice(0, 11) + "…" : s.abilityName);

    const g = this.g;
    g.clear();

    // HP-sáv
    const barW = 260, barH = 22, barX = cx - 150 - barW / 2, barY = H - 44;
    g.fillStyle(0x000000, 0.55); g.fillRect(barX, barY, barW, barH);
    const pct = Phaser.Math.Clamp(s.hp / s.maxHp, 0, 1);
    const col = pct > 0.5 ? 0x35c46a : pct > 0.25 ? 0xd8be3c : 0xd8443c;
    g.fillStyle(col, 1); g.fillRect(barX, barY, barW * pct, barH);
    g.lineStyle(1, 0xc8aa6e, 0.4); g.strokeRect(barX, barY, barW, barH);
    this.tHp.setText(`${Math.ceil(s.hp)} / ${s.maxHp}`).setPosition(barX + barW / 2, barY + barH / 2);

    // képesség-dobozok
    const slots = [
      { x: cx + 40, key: this.abBasic, name: this.abBasicName, cd: s.basic, max: s.basicMax },
      { x: cx + 106, key: this.abAbility, name: this.abAbilityName, cd: s.ability, max: s.abilityMax },
      { x: cx + 172, key: this.abFlash, name: this.abFlashName, cd: s.flash, max: s.flashMax },
    ];
    const boxY = H - 52, box = 52;
    for (const sl of slots) {
      const bx = sl.x - box / 2;
      g.fillStyle(0x0a1420, 0.85); g.fillRect(bx, boxY, box, box);
      const ready = sl.cd <= 0;
      g.lineStyle(2, ready ? 0x0ac8b9 : 0xc8aa6e, ready ? 1 : 0.5);
      g.strokeRect(bx, boxY, box, box);
      sl.key.setPosition(sl.x, boxY + 18);
      sl.name.setPosition(sl.x, boxY + 40);
      if (sl.cd > 0 && sl.max > 0) {
        const k = sl.cd / sl.max;
        g.fillStyle(0x000000, 0.72);
        g.fillRect(bx, boxY + box * (1 - k), box, box * k);
      }
    }
  }
}
