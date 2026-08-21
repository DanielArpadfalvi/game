import Phaser from "phaser";
import type { ArenaScene } from "./ArenaScene";

/** Aréna HUD: HP + pajzs, power-up jelzők, cooldownok, ranglista, killfeed. */
export class ArenaUIScene extends Phaser.Scene {
  private gs!: ArenaScene;
  private g!: Phaser.GameObjects.Graphics;
  private tHp!: Phaser.GameObjects.Text;
  private abAbility!: Phaser.GameObjects.Text;
  private abFlash!: Phaser.GameObjects.Text;
  private abAbilityName!: Phaser.GameObjects.Text;
  private board!: Phaser.GameObjects.Text;
  private feed!: Phaser.GameObjects.Text;
  private center!: Phaser.GameObjects.Text;
  private buffs!: Phaser.GameObjects.Text;

  constructor() { super("ArenaUI"); }

  create(): void {
    this.gs = this.scene.get("Arena") as ArenaScene;
    this.g = this.add.graphics();
    this.tHp = this.add.text(0, 0, "", { fontFamily: "Trebuchet MS, sans-serif", fontSize: "12px", fontStyle: "bold", color: "#ffffff" }).setOrigin(0.5);

    const keyStyle = { fontFamily: "Trebuchet MS, sans-serif", fontSize: "15px", fontStyle: "bold", color: "#f0e6d2" };
    const nameStyle = { fontFamily: "Trebuchet MS, sans-serif", fontSize: "9px", color: "#8899a6" };
    this.abAbility = this.add.text(0, 0, "E", keyStyle).setOrigin(0.5);
    this.abFlash = this.add.text(0, 0, "F", keyStyle).setOrigin(0.5);
    this.abAbilityName = this.add.text(0, 0, "Skill", nameStyle).setOrigin(0.5);
    this.add.text(0, 0, "", nameStyle); // spacer (megtartja a mintát)

    this.board = this.add.text(0, 0, "", { fontFamily: "Trebuchet MS, sans-serif", fontSize: "14px", color: "#f0e6d2", align: "right" }).setOrigin(1, 0);
    this.feed = this.add.text(0, 0, "", { fontFamily: "Trebuchet MS, sans-serif", fontSize: "12px", color: "#c9d2da", align: "left" }).setOrigin(0, 0);
    this.buffs = this.add.text(0, 0, "", { fontFamily: "Trebuchet MS, sans-serif", fontSize: "13px", fontStyle: "bold", color: "#0ac8b9", align: "center" }).setOrigin(0.5, 0);
    this.center = this.add.text(0, 0, "", { fontFamily: "Trebuchet MS, sans-serif", fontSize: "34px", fontStyle: "bold", color: "#f0e6d2", align: "center" }).setOrigin(0.5);
  }

  update(): void {
    if (!this.gs || !this.scene.isActive("Arena")) return;
    const s = this.gs.getState();
    const W = this.scale.width, H = this.scale.height, cx = W / 2;
    const g = this.g; g.clear();

    // HP + pajzs sáv
    const barW = 300, barH = 22, barX = cx - barW / 2, barY = H - 44;
    g.fillStyle(0x000000, 0.55); g.fillRect(barX, barY, barW, barH);
    const pct = Phaser.Math.Clamp(s.hp / s.maxHp, 0, 1);
    const col = pct > 0.5 ? 0x35c46a : pct > 0.25 ? 0xd8be3c : 0xd8443c;
    g.fillStyle(col, 1); g.fillRect(barX, barY, barW * pct, barH);
    if (s.shield > 0) {
      const sw = Math.min(barW, (s.shield / s.maxHp) * barW);
      g.fillStyle(0x4aa8e0, 0.85); g.fillRect(barX, barY - 6, sw, 5);
    }
    g.lineStyle(1, 0xc8aa6e, 0.4); g.strokeRect(barX, barY, barW, barH);
    this.tHp.setText(`${Math.ceil(s.hp)} / ${s.maxHp}${s.shield > 0 ? "  (+" + Math.round(s.shield) + ")" : ""}`).setPosition(barX + barW / 2, barY + barH / 2);

    // képesség-dobozok (skill + flash)
    const slots = [
      { x: cx + barW / 2 + 40, key: this.abAbility, name: this.abAbilityName, cd: s.ability, max: s.abilityMax, label: s.abilityKey },
      { x: cx + barW / 2 + 106, key: this.abFlash, name: null as Phaser.GameObjects.Text | null, cd: s.flash, max: s.flashMax, label: "F" },
    ];
    const boxY = H - 52, box = 52;
    this.abAbility.setText(s.abilityKey);
    this.abAbilityName.setText(s.abilityName.length > 12 ? s.abilityName.slice(0, 11) + "…" : s.abilityName);
    for (const sl of slots) {
      const bx = sl.x - box / 2;
      g.fillStyle(0x0a1420, 0.85); g.fillRect(bx, boxY, box, box);
      const ready = sl.cd <= 0; g.lineStyle(2, ready ? 0x0ac8b9 : 0xc8aa6e, ready ? 1 : 0.5); g.strokeRect(bx, boxY, box, box);
      sl.key.setPosition(sl.x, boxY + 18); if (sl.name) sl.name.setPosition(sl.x, boxY + 40);
      if (sl.cd > 0 && sl.max > 0) { const k = sl.cd / sl.max; g.fillStyle(0x000000, 0.72); g.fillRect(bx, boxY + box * (1 - k), box, box * k); }
    }

    // buff sor (aktív power-upok) a HP fölött
    const buffs: string[] = [];
    if (s.upg > 0) buffs.push(`⚡ Fejlesztés x${s.upg} (${s.upgTimer.toFixed(0)}s)`);
    if (s.invuln > 0.05) buffs.push(`★ Sérthetetlen (${s.invuln.toFixed(0)}s)`);
    if (s.shield > 0) buffs.push(`⛨ Pajzs ${Math.round(s.shield)}`);
    this.buffs.setText(buffs.join("    ")).setPosition(cx, barY - 34);

    // ranglista (jobb felül)
    const lines = s.board.map((b, i) => `${i + 1}. ${b.name}${b.me ? " (te)" : ""} — ${b.score}${b.alive ? "" : " ☠"}`);
    this.board.setText(lines.join("\n")).setPosition(W - 16, 14);

    // killfeed (bal felül)
    this.feed.setText(s.killfeed.join("\n")).setPosition(16, 14);

    // középső overlay (újraéledés)
    if (!s.alive) {
      g.fillStyle(0x06090f, 0.45); g.fillRect(0, 0, W, H);
      this.center.setText(`ÚJRAÉLEDÉS ${Math.ceil(s.respawn)}`).setPosition(cx, H / 2).setVisible(true);
    } else {
      this.center.setVisible(false);
    }
  }
}
