import Phaser from "phaser";

/** Phaser hex szín -> CSS "#rrggbb" */
export function css(color: number): string {
  return "#" + (color & 0xffffff).toString(16).padStart(6, "0");
}

/** Egyszerű, LoL-hangulatú gomb (arany keret). Container-t ad vissza. */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: { ghost?: boolean; width?: number } = {}
): Phaser.GameObjects.Container {
  const w = opts.width ?? 260;
  const h = 52;
  const g = scene.add.graphics();
  const draw = (hover: boolean) => {
    g.clear();
    if (opts.ghost) {
      g.fillStyle(0xc8aa6e, hover ? 0.16 : 0.06);
      g.lineStyle(1.5, 0xc8aa6e, 0.8);
    } else {
      g.fillStyle(0xc8aa6e, hover ? 1 : 0.9);
      g.lineStyle(1.5, 0xf0e6d2, 0.9);
    }
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 4);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 4);
  };
  draw(false);
  const txt = scene.add
    .text(0, 0, label, {
      fontFamily: "Trebuchet MS, sans-serif",
      fontSize: "17px",
      fontStyle: "bold",
      color: opts.ghost ? "#c8aa6e" : "#06090f",
    })
    .setOrigin(0.5);
  const c = scene.add.container(x, y, [g, txt]);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  c.on("pointerover", () => draw(true));
  c.on("pointerout", () => draw(false));
  c.on("pointerdown", onClick);
  return c;
}

/** Közös, kód-generált textúrák (hópehely, lágy glow). */
export function makeCommonTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists("snow")) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(5, 5, 4);
    g.generateTexture("snow", 10, 10);
    g.destroy();
  }
  if (!scene.textures.exists("glow")) {
    const size = 64;
    const tex = scene.textures.createCanvas("glow", size, size);
    if (tex) {
      const ctx = tex.getContext();
      const grad = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.35, "rgba(255,255,255,0.9)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      tex.refresh();
    }
  }
}

/** Világosítás/sötétítés egyszerű keveréssel (t: -1..1) */
export function shade(color: number, t: number): string {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  const mix = (c: number) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

/**
 * Kör alakú "token" textúra sütése egy bajnokhoz.
 * Ha a valódi (Data Dragon) kép betöltött, azt vágja körre; különben
 * színes placeholdert rajzol a bajnok kezdőbetűjével.
 */
export function bakeToken(
  scene: Phaser.Scene,
  destKey: string,
  srcKey: string | null,
  diameter: number,
  ringColor: number,
  bodyColor: number,
  letter: string
): void {
  if (scene.textures.exists(destKey)) return;
  const tex = scene.textures.createCanvas(destKey, diameter, diameter);
  if (!tex) return;
  const ctx = tex.getContext();
  const r = diameter / 2;

  ctx.clearRect(0, 0, diameter, diameter);
  ctx.save();
  ctx.beginPath();
  ctx.arc(r, r, r - 3, 0, Math.PI * 2);
  ctx.clip();

  const hasImg = srcKey && scene.textures.exists(srcKey);
  if (hasImg) {
    const img = scene.textures.get(srcKey!).getSourceImage() as HTMLImageElement;
    // középre igazított "cover" rajzolás
    const iw = img.width, ih = img.height;
    const scale = Math.max(diameter / iw, diameter / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (diameter - dw) / 2, (diameter - dh) / 2, dw, dh);
  } else {
    const g = ctx.createRadialGradient(r, r * 0.8, 4, r, r, r);
    g.addColorStop(0, shade(bodyColor, 0.35));
    g.addColorStop(1, shade(bodyColor, -0.55));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, diameter, diameter);
    ctx.fillStyle = css(ringColor);
    ctx.font = `bold ${Math.round(diameter * 0.5)}px 'Trebuchet MS', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, r, r + 2);
  }
  ctx.restore();

  // gyűrű
  ctx.lineWidth = 4;
  ctx.strokeStyle = css(ringColor);
  ctx.beginPath();
  ctx.arc(r, r, r - 3, 0, Math.PI * 2);
  ctx.stroke();

  tex.refresh();
}

/**
 * Portré-textúra a hősválasztóhoz. Loading artból, vagy placeholderből.
 */
export function bakePortrait(
  scene: Phaser.Scene,
  destKey: string,
  srcKey: string | null,
  w: number,
  h: number,
  color: number,
  letter: string
): void {
  if (scene.textures.exists(destKey)) return;
  const tex = scene.textures.createCanvas(destKey, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, w, h);

  const hasImg = srcKey && scene.textures.exists(srcKey);
  if (hasImg) {
    const img = scene.textures.get(srcKey!).getSourceImage() as HTMLImageElement;
    const iw = img.width, ih = img.height;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    // fejre igazítás: kicsit feljebb
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2 - h * 0.12, dw, dh);
  } else {
    const g = ctx.createRadialGradient(w / 2, h * 0.4, 6, w / 2, h * 0.5, h);
    g.addColorStop(0, shade(color, 0.4));
    g.addColorStop(1, shade(color, -0.6));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = css(color);
    ctx.font = `bold ${Math.round(h * 0.5)}px 'Trebuchet MS', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.85;
    ctx.fillText(letter, w / 2, h / 2);
    ctx.globalAlpha = 1;
  }
  tex.refresh();
}
