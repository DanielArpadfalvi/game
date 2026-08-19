import Phaser from "phaser";
import { WinterBackground } from "../bg";
import { button } from "../helpers";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("Menu");
  }

  create(): void {
    new WinterBackground(this);
    const { width: W, height: H } = this.scale;
    const cx = W / 2;

    this.add
      .text(cx, H * 0.26, "RIFT DODGE", {
        fontFamily: "Trebuchet MS, sans-serif",
        fontSize: "62px",
        fontStyle: "bold",
        color: "#f0e6d2",
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#c8aa6e", 18);

    this.add
      .text(cx, H * 0.26 + 52, "Skillshot Aréna — Howling Abyss", {
        fontFamily: "Trebuchet MS, sans-serif",
        fontSize: "18px",
        color: "#8899a6",
      })
      .setOrigin(0.5);

    const controls = [
      "Jobb klikk — mozgás a kattintott pontra",
      "Bal klikk — alaptámadás a kurzor felé",
      "Hős-skill — Ezreal: E · Vayne: Q",
      "F — Flash (villanás)",
    ];
    this.add
      .text(cx, H * 0.5, controls.join("\n"), {
        fontFamily: "Trebuchet MS, sans-serif",
        fontSize: "16px",
        color: "#c9d2da",
        align: "center",
        lineSpacing: 8,
      })
      .setOrigin(0.5);

    button(this, cx, H * 0.72, "HŐSVÁLASZTÁS", () => this.scene.start("Select"));

    if (!this.registry.get("assetsReal")) {
      this.add
        .text(cx, H - 26, "Placeholder mód — a valódi bajnok-képek az assetek hozzáadása után jelennek meg", {
          fontFamily: "Trebuchet MS, sans-serif",
          fontSize: "12px",
          color: "#5f6c79",
        })
        .setOrigin(0.5);
    }
  }
}
