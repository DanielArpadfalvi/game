import Phaser from "phaser";
import { WinterBackground } from "../bg";
import { CHAMPIONS } from "../data";
import { css } from "../helpers";

export class SelectScene extends Phaser.Scene {
  constructor() {
    super("Select");
  }

  create(): void {
    new WinterBackground(this);
    const { width: W, height: H } = this.scale;
    const cx = W / 2;

    this.add
      .text(cx, H * 0.14, "VÁLASSZ HŐST", {
        fontFamily: "Trebuchet MS, sans-serif",
        fontSize: "48px",
        fontStyle: "bold",
        color: "#f0e6d2",
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#c8aa6e", 14);

    this.add
      .text(cx, H * 0.14 + 44, "Mindegyik hőshöz jár egy egyedi képesség a mozgás és a Flash mellé", {
        fontFamily: "Trebuchet MS, sans-serif",
        fontSize: "15px",
        color: "#8899a6",
      })
      .setOrigin(0.5);

    const gap = 60;
    const cardW = 320;
    const startX = cx - (CHAMPIONS.length * cardW + (CHAMPIONS.length - 1) * gap) / 2 + cardW / 2;
    CHAMPIONS.forEach((c, i) => {
      this.makeCard(startX + i * (cardW + gap), H * 0.56, cardW, c);
    });
  }

  private makeCard(x: number, y: number, w: number, c: (typeof CHAMPIONS)[number]): void {
    const h = 400;
    const card = this.add.container(x, y);

    const g = this.add.graphics();
    const drawBg = (hover: boolean) => {
      g.clear();
      g.fillStyle(0x08101a, 0.88);
      g.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      g.lineStyle(hover ? 2 : 1, hover ? 0x0ac8b9 : 0xc8aa6e, hover ? 1 : 0.5);
      g.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    };
    drawBg(false);
    card.add(g);

    // portré
    const portrait = this.add.image(0, -h / 2 + 118, `portrait_${c.key}`).setDisplaySize(w - 36, 200);
    const maskG = this.make.graphics({});
    maskG.fillRoundedRect(x - (w - 36) / 2, y - h / 2 + 18, w - 36, 200, 6);
    portrait.setMask(maskG.createGeometryMask());
    card.add(portrait);

    card.add(
      this.add
        .text(0, -h / 2 + 240, c.name.toUpperCase(), {
          fontFamily: "Trebuchet MS, sans-serif",
          fontSize: "26px",
          fontStyle: "bold",
          color: "#f0e6d2",
        })
        .setOrigin(0.5, 0)
    );
    card.add(
      this.add
        .text(0, -h / 2 + 274, c.role, {
          fontFamily: "Trebuchet MS, sans-serif",
          fontSize: "13px",
          color: "#8899a6",
        })
        .setOrigin(0.5, 0)
    );

    // képesség
    card.add(
      this.add
        .text(-w / 2 + 22, -h / 2 + 306, c.abilityKey, {
          fontFamily: "Trebuchet MS, sans-serif",
          fontSize: "18px",
          fontStyle: "bold",
          color: css(c.accent),
          backgroundColor: "rgba(10,200,185,0.14)",
          padding: { x: 9, y: 6 },
        })
        .setOrigin(0, 0)
    );
    card.add(
      this.add
        .text(-w / 2 + 64, -h / 2 + 304, c.abilityName, {
          fontFamily: "Trebuchet MS, sans-serif",
          fontSize: "16px",
          fontStyle: "bold",
          color: css(c.color),
        })
        .setOrigin(0, 0)
    );
    card.add(
      this.add
        .text(-w / 2 + 64, -h / 2 + 328, c.abilityDesc, {
          fontFamily: "Trebuchet MS, sans-serif",
          fontSize: "12px",
          color: "#9fb0bd",
          wordWrap: { width: w - 86 },
          lineSpacing: 3,
        })
        .setOrigin(0, 0)
    );

    const hit = this.add
      .zone(0, 0, w, h)
      .setInteractive({ useHandCursor: true });
    card.add(hit);
    hit.on("pointerover", () => drawBg(true));
    hit.on("pointerout", () => drawBg(false));
    hit.on("pointerdown", () => {
      this.registry.set("champ", c.key);
      this.scene.start("Game");
    });
  }
}
