import Phaser from "phaser";

/**
 * Howling Abyss / ARAM ihlette téli háttér.
 * A statikus réteget (jég, korlátok, rúna-embléma) egy canvas-textúrába
 * sütjük, a havazást pedig Phaser particle-emitterrel adjuk hozzá.
 * Újrahasznosítható bármely jelenetben; kezeli az átméretezést is.
 */
export class WinterBackground {
  private scene: Phaser.Scene;
  private image!: Phaser.GameObjects.Image;
  private snow!: Phaser.GameObjects.Particles.ParticleEmitter;
  private key: string;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.key = "winterbg_" + scene.scene.key;
    this.build();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });
  }

  private onResize(): void {
    this.build();
  }

  private build(): void {
    const W = Math.max(1, Math.floor(this.scene.scale.width));
    const H = Math.max(1, Math.floor(this.scene.scale.height));

    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
    const tex = this.scene.textures.createCanvas(this.key, W, H);
    if (tex) this.paint(tex.getContext(), W, H), tex.refresh();

    if (!this.image) {
      this.image = this.scene.add.image(0, 0, this.key).setOrigin(0).setDepth(-100);
    } else {
      this.image.setTexture(this.key);
    }
    this.image.setDisplaySize(W, H);

    if (this.snow) this.snow.destroy();
    const lifespan = (H / 35) * 1000;
    this.snow = this.scene.add
      .particles(0, 0, "snow", {
        x: { min: 0, max: W },
        y: -10,
        lifespan,
        speedY: { min: 20, max: 55 },
        speedX: { min: -14, max: 6 },
        scale: { min: 0.2, max: 0.75 },
        alpha: { min: 0.2, max: 0.7 },
        quantity: 2,
        frequency: 55,
      })
      .setDepth(-90);
  }

  private paint(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    // jeges alap
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1826");
    g.addColorStop(0.5, "#16283a");
    g.addColorStop(1, "#0a1420");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const chasm = Math.min(120, H * 0.16);
    const top = ctx.createLinearGradient(0, 0, 0, chasm);
    top.addColorStop(0, "rgba(2,4,8,0.92)");
    top.addColorStop(1, "rgba(2,4,8,0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, chasm);
    const bot = ctx.createLinearGradient(0, H - chasm, 0, H);
    bot.addColorStop(0, "rgba(2,4,8,0)");
    bot.addColorStop(1, "rgba(2,4,8,0.92)");
    ctx.fillStyle = bot;
    ctx.fillRect(0, H - chasm, W, chasm);

    // havas kő textúra
    const speckles = Math.floor((W * H) / 2600);
    for (let i = 0; i < speckles; i++) {
      const x = Math.random() * W;
      const y = chasm * 0.6 + Math.random() * (H - chasm * 1.2);
      ctx.fillStyle = `rgba(200,230,255,${0.02 + Math.random() * 0.08})`;
      ctx.fillRect(x, y, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
    }

    this.rail(ctx, W, chasm, 1);
    this.rail(ctx, W, H - chasm, -1);

    // középső fagyott rúna-embléma
    ctx.save();
    ctx.translate(W / 2, H / 2);
    const R = Math.min(W, H) * 0.3;
    ctx.strokeStyle = "rgba(140,200,255,0.10)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(140,200,255,0.06)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.7, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7);
      ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      ctx.stroke();
    }
    ctx.restore();

    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  private rail(ctx: CanvasRenderingContext2D, W: number, y: number, dir: number): void {
    const step = 46, h = 22 * dir, w = 30;
    for (let x = 0; x < W; x += step) {
      ctx.fillStyle = "rgba(120,150,180,0.14)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(180,220,255,0.10)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = "rgba(220,240,255,0.16)";
      ctx.fillRect(x, y + (dir > 0 ? h - 3 : 0), w, 3);
    }
  }
}
