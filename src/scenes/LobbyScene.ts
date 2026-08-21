import Phaser from "phaser";
import { WinterBackground } from "../bg";
import { CHAMPIONS } from "../data";
import { button, css } from "../helpers";
import { net, makeRoomCode, Member } from "../net/net";

/**
 * Többjátékos lobbi: szoba létrehozása / csatlakozás kóddal vagy meghívó
 * linkkel (?room=KÓD), névválasztás, hősválasztás, ready + host-indítás.
 */
export class LobbyScene extends Phaser.Scene {
  private name = "";
  private champ = "ezreal";
  private inRoom = false;
  private ready = false;
  private status = "";
  private dyn!: Phaser.GameObjects.Container; // dinamikus (újrarajzolt) réteg
  private starting = false;

  constructor() {
    super("Lobby");
  }

  create(): void {
    new WinterBackground(this);
    this.name = localStorage.getItem("riftdodge_name") || "Játékos-" + Math.floor(Math.random() * 900 + 100);
    this.champ = localStorage.getItem("riftdodge_champ") || (this.registry.get("champ") as string) || "ezreal";
    this.inRoom = false;
    this.ready = false;
    this.starting = false;

    this.add
      .text(this.scale.width / 2, 60, "TÖBBJÁTÉKOS LOBBI", {
        fontFamily: "Trebuchet MS, sans-serif", fontSize: "40px", fontStyle: "bold", color: "#f0e6d2",
      })
      .setOrigin(0.5)
      .setShadow(0, 0, "#c8aa6e", 14);

    this.dyn = this.add.container(0, 0);

    // meghívó link automatikus csatlakozás
    const params = new URLSearchParams(location.search);
    const roomFromUrl = params.get("room");
    if (roomFromUrl) {
      this.status = "Csatlakozás a meghívott szobához…";
      this.render();
      void this.doJoin(roomFromUrl);
    } else {
      this.render();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.render, this);
    });
    this.scale.on(Phaser.Scale.Events.RESIZE, this.render, this);
  }

  private async doJoin(room: string): Promise<void> {
    try {
      net.clearHandlers();
      await net.join(room, { name: this.name, champ: this.champ, ready: false });
      this.inRoom = true;
      this.status = "";
      // link a címsorba, hogy megosztható legyen
      const url = new URL(location.href);
      url.searchParams.set("room", net.room);
      history.replaceState(null, "", url.toString());

      net.onPresence(() => this.render());
      net.on("start", () => this.enterArena());
      this.render();
    } catch (e) {
      this.status = "Nem sikerült csatlakozni. Próbáld újra.";
      this.render();
    }
  }

  private enterArena(): void {
    if (this.starting) return;
    this.starting = true;
    this.registry.set("champ", this.champ);
    this.registry.set("playerName", this.name);
    this.scene.start("Arena");
  }

  private inviteLink(): string {
    const url = new URL(location.href);
    url.searchParams.set("room", net.room);
    return url.toString();
  }

  private render(): void {
    this.dyn.removeAll(true);
    const W = this.scale.width, cx = W / 2;

    if (this.status) {
      this.dyn.add(this.add.text(cx, 110, this.status, {
        fontFamily: "Trebuchet MS, sans-serif", fontSize: "15px", color: "#8899a6",
      }).setOrigin(0.5));
    }

    // ---- Név + hős sor (mindig) ----
    this.dyn.add(this.add.text(cx, 150, "Neved:", {
      fontFamily: "Trebuchet MS, sans-serif", fontSize: "13px", color: "#7f8c99",
    }).setOrigin(0.5));
    this.dyn.add(this.add.text(cx, 172, this.name, {
      fontFamily: "Trebuchet MS, sans-serif", fontSize: "22px", fontStyle: "bold", color: css(0x0ac8b9),
    }).setOrigin(0.5));
    this.addSmallBtn(cx + 150, 172, "átnevez", () => {
      const n = window.prompt("Neved:", this.name);
      if (n && n.trim()) {
        this.name = n.trim().slice(0, 16);
        localStorage.setItem("riftdodge_name", this.name);
        if (this.inRoom) void net.setPresence({ name: this.name });
        this.render();
      }
    });

    // hősválasztó (két token)
    const champs = CHAMPIONS;
    const startX = cx - (champs.length * 70) / 2 + 35;
    this.dyn.add(this.add.text(cx, 208, "Hős:", {
      fontFamily: "Trebuchet MS, sans-serif", fontSize: "13px", color: "#7f8c99",
    }).setOrigin(0.5));
    champs.forEach((c, i) => {
      const x = startX + i * 70, y = 250;
      const sel = c.key === this.champ;
      const ring = this.add.circle(x, y, 30, 0x000000, 0).setStrokeStyle(sel ? 3 : 1, sel ? 0x0ac8b9 : 0xc8aa6e, sel ? 1 : 0.5);
      const tok = this.add.image(x, y, `hero_${c.key}`).setDisplaySize(52, 52);
      const label = this.add.text(x, y + 34, c.name, {
        fontFamily: "Trebuchet MS, sans-serif", fontSize: "11px", color: sel ? "#f0e6d2" : "#8899a6",
      }).setOrigin(0.5);
      const zone = this.add.zone(x, y, 64, 64).setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => {
        this.champ = c.key;
        localStorage.setItem("riftdodge_champ", this.champ);
        if (this.inRoom) void net.setPresence({ champ: this.champ });
        this.render();
      });
      this.dyn.add([ring, tok, label, zone]);
    });

    if (!this.inRoom) {
      this.renderPreJoin(cx);
    } else {
      this.renderRoom(cx);
    }
  }

  private renderPreJoin(cx: number): void {
    this.dyn.add(button(this, cx, 340, "ÚJ SZOBA (HOST)", () => {
      this.status = "Szoba létrehozása…"; this.render();
      void this.doJoin(makeRoomCode());
    }, { width: 300 }));
    this.dyn.add(button(this, cx, 402, "CSATLAKOZÁS KÓDDAL", () => {
      const code = window.prompt("Szobakód:");
      if (code && code.trim()) {
        this.status = "Csatlakozás…"; this.render();
        void this.doJoin(code.trim());
      }
    }, { ghost: true, width: 300 }));
    this.dyn.add(button(this, cx, 470, "◂ VISSZA A MENÜBE", () => {
      void net.leave();
      this.scene.start("Menu");
    }, { ghost: true, width: 220 }));
  }

  private renderRoom(cx: number): void {
    // szobakód nagyban + link másolás
    this.dyn.add(this.add.text(cx, 306, "SZOBAKÓD", {
      fontFamily: "Trebuchet MS, sans-serif", fontSize: "12px", color: "#7f8c99",
    }).setOrigin(0.5));
    this.dyn.add(this.add.text(cx, 326, net.room.split("").join(" "), {
      fontFamily: "Trebuchet MS, sans-serif", fontSize: "34px", fontStyle: "bold", color: "#f0e6d2",
    }).setOrigin(0.5).setShadow(0, 0, "#c8aa6e", 10));
    this.addSmallBtn(cx + 130, 326, "link", () => {
      const link = this.inviteLink();
      navigator.clipboard?.writeText(link).then(
        () => this.flash("Meghívó link a vágólapon!"),
        () => window.prompt("Másold ki a meghívó linket:", link)
      );
    });

    // tagok listája
    const members = net.members();
    const hostId = net.hostId();
    const listY = 372;
    this.dyn.add(this.add.text(cx, listY - 22, `JÁTÉKOSOK (${members.length})`, {
      fontFamily: "Trebuchet MS, sans-serif", fontSize: "12px", color: "#7f8c99",
    }).setOrigin(0.5));
    members.forEach((m: Member, i) => {
      const y = listY + i * 30;
      const isMe = m.id === net.id;
      const cName = CHAMPIONS.find((c) => c.key === m.champ)?.name ?? m.champ;
      const badge = m.id === hostId ? "★ HOST" : m.ready ? "✔ kész" : "…";
      const badgeCol = m.id === hostId ? "#c8aa6e" : m.ready ? "#35c46a" : "#7f8c99";
      this.dyn.add(this.add.text(cx - 150, y, `${m.name}${isMe ? " (te)" : ""}`, {
        fontFamily: "Trebuchet MS, sans-serif", fontSize: "15px", fontStyle: isMe ? "bold" : "normal",
        color: isMe ? "#f0e6d2" : "#c9d2da",
      }).setOrigin(0, 0.5));
      this.dyn.add(this.add.text(cx + 40, y, cName, {
        fontFamily: "Trebuchet MS, sans-serif", fontSize: "13px", color: "#8899a6",
      }).setOrigin(0, 0.5));
      this.dyn.add(this.add.text(cx + 150, y, badge, {
        fontFamily: "Trebuchet MS, sans-serif", fontSize: "13px", fontStyle: "bold", color: badgeCol,
      }).setOrigin(1, 0.5));
    });

    const btnY = listY + members.length * 30 + 40;

    // ready gomb
    this.dyn.add(button(this, cx - 110, btnY, this.ready ? "MÉGSEM KÉSZ" : "KÉSZ VAGYOK", () => {
      this.ready = !this.ready;
      void net.setPresence({ ready: this.ready });
    }, { ghost: this.ready, width: 200 }));

    // host indít gomb
    const isHost = net.isHost();
    const allReady = members.length >= 1 && members.every((m) => m.id === hostId || m.ready);
    if (isHost) {
      const canStart = allReady;
      const startBtn = button(this, cx + 110, btnY, "START ▶", () => {
        if (!canStart) { this.flash("Várj, míg mindenki kész!"); return; }
        net.send("start", {});
        this.enterArena();
      }, { width: 200 });
      startBtn.setAlpha(canStart ? 1 : 0.5);
      this.dyn.add(startBtn);
    } else {
      this.dyn.add(this.add.text(cx + 110, btnY, "A host indít…", {
        fontFamily: "Trebuchet MS, sans-serif", fontSize: "14px", color: "#8899a6",
      }).setOrigin(0.5));
    }

    this.dyn.add(button(this, cx, btnY + 56, "◂ KILÉPÉS", () => {
      void net.leave();
      const url = new URL(location.href);
      url.searchParams.delete("room");
      history.replaceState(null, "", url.toString());
      this.scene.start("Menu");
    }, { ghost: true, width: 180 }));
  }

  private addSmallBtn(x: number, y: number, label: string, onClick: () => void): void {
    const t = this.add.text(x, y, "[" + label + "]", {
      fontFamily: "Trebuchet MS, sans-serif", fontSize: "13px", color: "#0ac8b9",
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    t.on("pointerover", () => t.setColor("#5fe0d4"));
    t.on("pointerout", () => t.setColor("#0ac8b9"));
    t.on("pointerdown", onClick);
    this.dyn.add(t);
  }

  private flash(msg: string): void {
    const t = this.add.text(this.scale.width / 2, this.scale.height - 40, msg, {
      fontFamily: "Trebuchet MS, sans-serif", fontSize: "15px", fontStyle: "bold", color: "#c8aa6e",
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, alpha: 0, y: t.y - 20, duration: 1600, onComplete: () => t.destroy() });
  }
}
