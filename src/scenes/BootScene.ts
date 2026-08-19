import Phaser from "phaser";
import { ATTACKERS, CHAMPIONS, DDRAGON_CHAMPS } from "../data";
import { bakeToken, bakePortrait, makeCommonTextures } from "../helpers";

/**
 * Betölti a valódi (Data Dragon) bajnok-képeket, ha megvannak a
 * public/assets/champions mappában; ami hiányzik, ahhoz placeholder készül.
 * Így a valódi arcképek "maguktól" bekötnek, amint az assetek elérhetők.
 */
export class BootScene extends Phaser.Scene {
  private failed = new Set<string>();

  constructor() {
    super("Boot");
  }

  preload(): void {
    this.load.setPath("assets/champions");
    // hiányzó fájl nem állítja meg a betöltést, csak jelöljük
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.failed.add(file.key);
    });
    for (const c of DDRAGON_CHAMPS) {
      this.load.image(`sq_${c}`, `${c}.png`);
      this.load.image(`load_${c}`, `${c}_load.jpg`);
    }

    // egyszerű betöltő-jelző
    const { width, height } = this.scale;
    const txt = this.add
      .text(width / 2, height / 2, "Betöltés…", {
        fontFamily: "Trebuchet MS, sans-serif",
        fontSize: "22px",
        color: "#c8aa6e",
      })
      .setOrigin(0.5);
    this.load.on(Phaser.Loader.Events.COMPLETE, () => txt.destroy());
  }

  create(): void {
    makeCommonTextures(this);

    // Field-tokenek (kör alakú bajnok-zsetonok)
    const seen = new Set<string>();
    for (const a of ATTACKERS) {
      const src = this.failed.has(`sq_${a.ddragon}`) ? null : `sq_${a.ddragon}`;
      bakeToken(this, `token_${a.key}`, src, 96, a.ring, a.color, a.name[0]);
      seen.add(a.key);
    }
    for (const c of CHAMPIONS) {
      if (!seen.has(c.key)) {
        const src = this.failed.has(`sq_${c.ddragon}`) ? null : `sq_${c.ddragon}`;
        bakeToken(this, `token_${c.key}`, src, 96, c.accent, c.color, c.name[0]);
      }
      // hero-token az akcentussal (a játékos mindig ebből)
      const srcH = this.failed.has(`sq_${c.ddragon}`) ? null : `sq_${c.ddragon}`;
      bakeToken(this, `hero_${c.key}`, srcH, 104, c.accent, c.color, c.name[0]);
      // portré a hősválasztóhoz
      const srcP = this.failed.has(`load_${c.ddragon}`) ? null : `load_${c.ddragon}`;
      bakePortrait(this, `portrait_${c.key}`, srcP, 300, 340, c.accent, c.name[0]);
    }

    // jelöljük, sikerült-e valódi assetet betölteni (HUD-jelzéshez)
    const anyReal = DDRAGON_CHAMPS.some((c) => !this.failed.has(`sq_${c}`));
    this.registry.set("assetsReal", anyReal);
    this.registry.set("best", parseInt(localStorage.getItem("riftdodge_best") || "0", 10));
    this.registry.set("champ", "ezreal");

    this.scene.start("Menu");
  }
}
