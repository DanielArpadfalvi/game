"use strict";

/* =========================================================================
   RIFT DODGE — Skillshot Aréna (Howling Abyss)
   Böngészős, egyjátékos. LoL-inspirált (nem tartalmaz Riot IP-t).

   Vezérlés:
     Jobb klikk : mozgás a kattintott pontra
     Bal klikk  : alaptámadás a kurzor felé (ellenség kilövése pontért)
     Hős-skill  : Ezreal → E (Arcane Shift) · Vayne → Q (Tumble)
     F          : Flash (villanás)

   Ellenséges bajnokok jellegzetes skillshotjai:
     Ezreal  — Mystic Shot   : gyors, vékony arany lövedék
     Ryze    — Overload      : lila-kék rúna-lövés, közepes
     Ziggs   — Bouncing Bomb : pattogó bomba → narancs AoE robbanás
     Ashe    — Crystal Arrow : lassú, nagy jeges nyíl
     Lux     — Light Binding : ragyogó arany-fehér fénygömb-pár
   ========================================================================= */

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0, DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildBackground();
    resetSnow();
  }
  window.addEventListener("resize", resize);

  // ---- Matek ----
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const len = (x, y) => Math.hypot(x, y);
  const angLerp = (a, b, t) => {
    let d = ((b - a + Math.PI) % TAU) - Math.PI;
    return a + d * t;
  };

  // =======================================================================
  //  Ellenséges bajnokok — skillshot-definíciók
  // =======================================================================
  const ATTACKERS = {
    ezreal: {
      name: "Ezreal", body: "#f4c542", glow: "rgba(255,224,122,0.9)", ring: "#ffe07a",
      attack: "line",
      shot: { style: "ezreal", width: 15, speed: 1150, warn: 0.42, dmg: 15, color: "#ffe07a", length: 2000 },
    },
    ryze: {
      name: "Ryze", body: "#7a4fc4", glow: "rgba(150,110,240,0.9)", ring: "#b48cff",
      attack: "line",
      shot: { style: "ryze", width: 28, speed: 720, warn: 0.6, dmg: 18, color: "#a26cff", length: 2000 },
    },
    ziggs: {
      name: "Ziggs", body: "#e8842e", glow: "rgba(255,150,60,0.9)", ring: "#ffb14a",
      attack: "bomb",
      shot: { style: "ziggs", radius: 88, lob: 0.85, dmg: 24, color: "#ff8a3a" },
    },
    ashe: {
      name: "Ashe", body: "#4aa8e0", glow: "rgba(120,200,255,0.9)", ring: "#aee3ff",
      attack: "line",
      shot: { style: "ashe", width: 38, speed: 470, warn: 0.85, dmg: 30, color: "#bfeaff", length: 2200 },
    },
    lux: {
      name: "Lux", body: "#e8d24a", glow: "rgba(255,240,150,0.9)", ring: "#fff3a0",
      attack: "line",
      shot: { style: "lux", width: 26, speed: 820, warn: 0.58, dmg: 20, color: "#fff3a0", length: 2000 },
    },
  };
  const ATTACKER_KEYS = Object.keys(ATTACKERS);

  // =======================================================================
  //  Játszható hősök
  // =======================================================================
  const CHAMPIONS = {
    ezreal: {
      name: "Ezreal", body: "#f4c542", accent: "#ffe07a",
      abilityKey: "E", abilityName: "Arcane Shift", abilityCd: 4.5,
      cast: castArcaneShift,
    },
    vayne: {
      name: "Vayne", body: "#8a7be0", accent: "#b3a7ef",
      abilityKey: "Q", abilityName: "Tumble", abilityCd: 2.4,
      cast: castTumble,
    },
  };

  // =======================================================================
  //  Állapot
  // =======================================================================
  const State = { MENU: 0, SELECT: 1, PLAYING: 2, OVER: 3 };
  let state = State.MENU;

  const BEST_KEY = "riftdodge_best";
  let best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10);

  const mouse = { x: 0, y: 0 };
  let chosenChamp = "ezreal";

  let player, enemies, telegraphs, projectiles, playerShots, particles, floaters, lobs;
  let elapsed, score, wave, kills, spawnTimer, difficulty, waveTimer;

  const PLAYER = { radius: 16, speed: 345, maxHp: 100 };
  const FLASH_RANGE = 250;
  const FLASH_CD = 5.0;
  const BASIC_CD = 0.5;
  const BASIC_SPEED = 920;
  const BASIC_RANGE = 720;

  function resetGame() {
    player = {
      x: W / 2, y: H / 2, tx: W / 2, ty: H / 2,
      hp: PLAYER.maxHp,
      flashCd: 0, basicCd: 0, abilityCd: 0,
      facing: 0, hitFlash: 0,
      champ: CHAMPIONS[chosenChamp],
      dash: null,
      ghosts: [],
    };
    enemies = []; telegraphs = []; projectiles = []; playerShots = [];
    particles = []; floaters = []; lobs = [];
    elapsed = 0; score = 0; wave = 1; kills = 0;
    difficulty = 1; spawnTimer = 0.7; waveTimer = 0;
  }

  // =======================================================================
  //  Téli Howling Abyss háttér (offscreen, egyszer megrajzolva)
  // =======================================================================
  const bg = document.createElement("canvas");
  const bgx = bg.getContext("2d");
  let snow = [];

  function buildBackground() {
    bg.width = Math.max(1, Math.floor(W * DPR));
    bg.height = Math.max(1, Math.floor(H * DPR));
    bgx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bgx.clearRect(0, 0, W, H);

    // jeges alap
    const g = bgx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0c1826");
    g.addColorStop(0.5, "#16283a");
    g.addColorStop(1, "#0a1420");
    bgx.fillStyle = g;
    bgx.fillRect(0, 0, W, H);

    // a szakadék (abyss) a felső és alsó él mentén — sötét sáv
    const chasm = Math.min(120, H * 0.16);
    const top = bgx.createLinearGradient(0, 0, 0, chasm);
    top.addColorStop(0, "rgba(2,4,8,0.92)");
    top.addColorStop(1, "rgba(2,4,8,0)");
    bgx.fillStyle = top; bgx.fillRect(0, 0, W, chasm);
    const bot = bgx.createLinearGradient(0, H - chasm, 0, H);
    bot.addColorStop(0, "rgba(2,4,8,0)");
    bot.addColorStop(1, "rgba(2,4,8,0.92)");
    bgx.fillStyle = bot; bgx.fillRect(0, H - chasm, W, chasm);

    // havas kő textúra: apró, statikus pöttyök
    for (let i = 0; i < Math.floor((W * H) / 2600); i++) {
      const x = rand(0, W), y = rand(chasm * 0.6, H - chasm * 0.6);
      const a = rand(0.02, 0.10);
      bgx.fillStyle = `rgba(200,230,255,${a})`;
      bgx.fillRect(x, y, rand(1, 2.5), rand(1, 2.5));
    }

    // hidszéli korlát/pillérek (fent és lent)
    drawRail(chasm, 1);
    drawRail(H - chasm, -1);

    // középső fagyott rúna-embléma
    bgx.save();
    bgx.translate(W / 2, H / 2);
    bgx.strokeStyle = "rgba(140,200,255,0.10)";
    bgx.lineWidth = 3;
    const R = Math.min(W, H) * 0.30;
    bgx.beginPath(); bgx.arc(0, 0, R, 0, TAU); bgx.stroke();
    bgx.strokeStyle = "rgba(140,200,255,0.06)";
    bgx.lineWidth = 2;
    bgx.beginPath(); bgx.arc(0, 0, R * 0.7, 0, TAU); bgx.stroke();
    // rúna-küllők
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      bgx.beginPath();
      bgx.moveTo(Math.cos(a) * R * 0.7, Math.sin(a) * R * 0.7);
      bgx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      bgx.stroke();
    }
    bgx.restore();

    // finom vignetta
    const v = bgx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.5)");
    bgx.fillStyle = v; bgx.fillRect(0, 0, W, H);
  }

  // hidkorlát pillérsor egy adott y-vonalnál (dir: 1 = lefelé néző fent, -1 = fent néző lent)
  function drawRail(y, dir) {
    const step = 46, h = 22 * dir, w = 30;
    bgx.fillStyle = "rgba(120,150,180,0.14)";
    bgx.strokeStyle = "rgba(180,220,255,0.10)";
    bgx.lineWidth = 1;
    for (let x = 0; x < W; x += step) {
      bgx.fillRect(x, y, w, h);
      bgx.strokeRect(x, y, w, h);
      // hósapka a pilléren
      bgx.fillStyle = "rgba(220,240,255,0.16)";
      bgx.fillRect(x, y + (dir > 0 ? h - 3 : 0), w, 3);
      bgx.fillStyle = "rgba(120,150,180,0.14)";
    }
  }

  function resetSnow() {
    snow = [];
    const n = Math.floor((W * H) / 14000);
    for (let i = 0; i < n; i++) {
      snow.push({
        x: rand(0, W), y: rand(0, H),
        r: rand(0.8, 2.6),
        vy: rand(18, 46),
        vx: rand(-14, 6),
        sway: rand(0, TAU),
        swaySpeed: rand(0.6, 1.6),
        alpha: rand(0.25, 0.75),
      });
    }
  }

  function updateSnow(dt) {
    for (const f of snow) {
      f.sway += f.swaySpeed * dt;
      f.x += (f.vx + Math.sin(f.sway) * 10) * dt;
      f.y += f.vy * dt;
      if (f.y > H + 4) { f.y = -4; f.x = rand(0, W); }
      if (f.x < -4) f.x = W + 4;
      if (f.x > W + 4) f.x = -4;
    }
  }

  function drawSnow() {
    for (const f of snow) {
      ctx.globalAlpha = f.alpha;
      ctx.fillStyle = "#eaf4ff";
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // =======================================================================
  //  Ellenség létrehozás + támadás
  // =======================================================================
  let spawnIndex = 0;
  function spawnEnemy() {
    const margin = 64;
    const edge = Math.floor(rand(0, 4));
    let x, y;
    if (edge === 0) { x = rand(margin, W - margin); y = margin; }
    else if (edge === 1) { x = W - margin; y = rand(margin, H - margin); }
    else if (edge === 2) { x = rand(margin, W - margin); y = H - margin; }
    else { x = margin; y = rand(margin, H - margin); }

    // körbe-forgó kiosztás, hogy mind az 5 bajnok megjelenjen
    const key = ATTACKER_KEYS[spawnIndex % ATTACKER_KEYS.length];
    spawnIndex++;

    enemies.push({
      x, y, radius: 20, key, def: ATTACKERS[key],
      fireTimer: rand(1.0, 2.2),
      drift: rand(-1, 1), spawnAnim: 0, dead: false, castAnim: 0,
    });
  }

  function enemyFire(e) {
    e.castAnim = 0.35; // rövid "varázslás" felvillanás
    const def = e.def;
    if (def.attack === "line") {
      const lead = 0.14;
      const px = player.x + (player.tx - player.x) * lead;
      const py = player.y + (player.ty - player.y) * lead;
      const ang = Math.atan2(py - e.y, px - e.x);
      const warn = clamp(def.shot.warn - (difficulty - 1) * 0.04, 0.32, def.shot.warn);
      telegraphs.push({
        type: "line", x: e.x, y: e.y, ang,
        width: def.shot.width, length: def.shot.length,
        warn, t: 0, damage: def.shot.dmg, speed: def.shot.speed + (difficulty - 1) * 45,
        color: def.shot.color, style: def.shot.style, fired: false,
      });
    } else if (def.attack === "bomb") {
      // Ziggs: pattogó bomba a játékos alá — AoE robbanás
      const tx = clamp(player.x + rand(-30, 30), 40, W - 40);
      const ty = clamp(player.y + rand(-30, 30), 40, H - 40);
      const lob = def.shot.lob;
      lobs.push({ sx: e.x, sy: e.y, tx, ty, t: 0, dur: lob, color: def.shot.color });
      telegraphs.push({
        type: "circle", x: tx, y: ty, radius: def.shot.radius,
        warn: lob, t: 0, damage: def.shot.dmg, style: "ziggs", exploded: false,
      });
    }
  }

  function fireProjectile(t) {
    projectiles.push({
      x: t.x, y: t.y,
      vx: Math.cos(t.ang) * t.speed, vy: Math.sin(t.ang) * t.speed,
      ang: t.ang, radius: t.width * 0.5, damage: t.damage,
      color: t.color, style: t.style, life: 3.2, trail: [],
    });
  }

  function explode(x, y, radius, damage, style) {
    burst(x, y, style === "ziggs" ? "#ff8a3a" : "#ff7a4a", 30, 3.8);
    particles.push({ ring: true, x, y, r: 4, maxR: radius, t: 0, dur: 0.38, color: "#ff9a4a" });
    if (dist2(player.x, player.y, x, y) < (radius + player.radius) ** 2) damagePlayer(damage);
  }

  // =======================================================================
  //  Effektek
  // =======================================================================
  function burst(x, y, color, count, speedScale) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU), s = rand(40, 220) * (speedScale || 1);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand(1.5, 3.5), t: 0, dur: rand(0.3, 0.7), color });
    }
  }
  function floatText(x, y, text, color) { floaters.push({ x, y, text, color, t: 0, dur: 0.9 }); }

  function damagePlayer(amount) {
    if (state !== State.PLAYING) return;
    if (player.dash) return; // gurulás/villanás közben rövid sebezhetetlenség
    player.hp -= amount;
    player.hitFlash = 0.25;
    burst(player.x, player.y, "#e04a4a", 14, 1.4);
    floatText(player.x, player.y - 26, "-" + amount, "#ff6b6b");
    if (player.hp <= 0) { player.hp = 0; gameOver(); }
  }

  // =======================================================================
  //  Bemenet
  // =======================================================================
  canvas.addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (state !== State.PLAYING) return;
    player.tx = clamp(e.clientX, 0, W);
    player.ty = clamp(e.clientY, 0, H);
    particles.push({ ring: true, x: player.tx, y: player.ty, r: 2, maxR: 16, t: 0, dur: 0.4, color: "#0ac8b9" });
  });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0 || state !== State.PLAYING) return;
    castBasic();
  });

  window.addEventListener("keydown", (e) => {
    if (state !== State.PLAYING) return;
    const k = e.key.toLowerCase();
    if (k === "f") castFlash();
    else if (k === player.champ.abilityKey.toLowerCase()) player.champ.cast();
  });

  function castBasic() {
    if (player.basicCd > 0) return;
    player.basicCd = BASIC_CD;
    const ang = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    player.facing = ang;
    playerShots.push({
      x: player.x + Math.cos(ang) * PLAYER.radius, y: player.y + Math.sin(ang) * PLAYER.radius,
      vx: Math.cos(ang) * BASIC_SPEED, vy: Math.sin(ang) * BASIC_SPEED,
      radius: 8, traveled: 0, trail: [], color: player.champ.accent, homing: false, target: null,
    });
  }

  function castFlash() {
    if (player.flashCd > 0) return;
    player.flashCd = FLASH_CD;
    const ang = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const d = Math.min(FLASH_RANGE, len(mouse.x - player.x, mouse.y - player.y));
    burst(player.x, player.y, "#f0e6d2", 18, 1.2);
    player.x = clamp(player.x + Math.cos(ang) * d, PLAYER.radius, W - PLAYER.radius);
    player.y = clamp(player.y + Math.sin(ang) * d, PLAYER.radius, H - PLAYER.radius);
    player.tx = player.x; player.ty = player.y;
    burst(player.x, player.y, "#c9e8ff", 22, 1.6);
  }

  // Ezreal E — Arcane Shift: villanás + célkövető nyíl a legközelebbi ellenségre
  function castArcaneShift() {
    if (player.abilityCd > 0) return;
    player.abilityCd = player.champ.abilityCd;
    const ang = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const d = Math.min(400, len(mouse.x - player.x, mouse.y - player.y));
    burst(player.x, player.y, "#ffe07a", 20, 1.4);
    player.x = clamp(player.x + Math.cos(ang) * d, PLAYER.radius, W - PLAYER.radius);
    player.y = clamp(player.y + Math.sin(ang) * d, PLAYER.radius, H - PLAYER.radius);
    player.tx = player.x; player.ty = player.y;
    burst(player.x, player.y, "#ffe07a", 24, 1.6);
    // legközelebbi ellenség keresése
    let nearest = null, nd = Infinity;
    for (const en of enemies) {
      if (en.dead) continue;
      const dd = dist2(player.x, player.y, en.x, en.y);
      if (dd < nd) { nd = dd; nearest = en; }
    }
    if (nearest) {
      const a2 = Math.atan2(nearest.y - player.y, nearest.x - player.x);
      playerShots.push({
        x: player.x, y: player.y,
        vx: Math.cos(a2) * 780, vy: Math.sin(a2) * 780,
        radius: 9, traveled: 0, trail: [], color: "#ffe07a", homing: true, target: nearest,
      });
    }
  }

  // Vayne Q — Tumble: gyors gurulás a kurzor irányába
  function castTumble() {
    if (player.abilityCd > 0) return;
    player.abilityCd = player.champ.abilityCd;
    const ang = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const d = 300;
    const tx = clamp(player.x + Math.cos(ang) * d, PLAYER.radius, W - PLAYER.radius);
    const ty = clamp(player.y + Math.sin(ang) * d, PLAYER.radius, H - PLAYER.radius);
    player.dash = { fromx: player.x, fromy: player.y, tox: tx, toy: ty, t: 0, dur: 0.16 };
    player.facing = ang;
  }

  // =======================================================================
  //  Frissítés
  // =======================================================================
  function update(dt) {
    elapsed += dt;
    score = Math.floor(elapsed * 10) + kills * 50;
    difficulty = 1 + elapsed / 22;

    waveTimer += dt;
    if (waveTimer >= 15) { waveTimer = 0; wave++; floatText(W / 2, 92, "HULLÁM " + wave, "#c8aa6e"); }

    updatePlayer(dt);
    updateSpawns(dt);
    updateEnemies(dt);
    updateTelegraphs(dt);
    updateLobs(dt);
    updateProjectiles(dt);
    updatePlayerShots(dt);
    updateParticles(dt);
  }

  function updatePlayer(dt) {
    player.flashCd = Math.max(0, player.flashCd - dt);
    player.basicCd = Math.max(0, player.basicCd - dt);
    player.abilityCd = Math.max(0, player.abilityCd - dt);
    player.hitFlash = Math.max(0, player.hitFlash - dt);

    // gurulás (Vayne Tumble)
    if (player.dash) {
      const d = player.dash;
      d.t += dt;
      const k = clamp(d.t / d.dur, 0, 1);
      const ease = 1 - (1 - k) * (1 - k);
      player.x = d.fromx + (d.tox - d.fromx) * ease;
      player.y = d.fromy + (d.toy - d.fromy) * ease;
      player.ghosts.push({ x: player.x, y: player.y, t: 0, color: player.champ.accent });
      if (k >= 1) { player.dash = null; player.tx = player.x; player.ty = player.y; }
    } else {
      const dx = player.tx - player.x, dy = player.ty - player.y, d = len(dx, dy);
      if (d > 1) {
        const step = Math.min(d, PLAYER.speed * dt);
        player.x += (dx / d) * step; player.y += (dy / d) * step;
        player.facing = Math.atan2(dy, dx);
      }
    }
    player.x = clamp(player.x, PLAYER.radius, W - PLAYER.radius);
    player.y = clamp(player.y, PLAYER.radius, H - PLAYER.radius);

    for (const g of player.ghosts) g.t += dt;
    player.ghosts = player.ghosts.filter((g) => g.t < 0.25);
  }

  function updateSpawns(dt) {
    spawnTimer -= dt;
    const maxEnemies = Math.min(3 + Math.floor(elapsed / 12), 9);
    if (spawnTimer <= 0 && enemies.length < maxEnemies) {
      spawnEnemy();
      spawnTimer = rand(1.5, 3.0) / Math.sqrt(difficulty);
    }
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (e.spawnAnim < 1) e.spawnAnim = Math.min(1, e.spawnAnim + dt * 3);
      if (e.castAnim > 0) e.castAnim = Math.max(0, e.castAnim - dt);
      e.x += e.drift * 16 * dt;
      e.y += Math.cos(elapsed + e.x) * 6 * dt;
      e.x = clamp(e.x, 44, W - 44); e.y = clamp(e.y, 44, H - 44);
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) { enemyFire(e); e.fireTimer = rand(1.7, 3.1) / difficulty; }
    }
    enemies = enemies.filter((e) => !e.dead);
  }

  function updateTelegraphs(dt) {
    for (const t of telegraphs) {
      t.t += dt;
      if (t.type === "line" && !t.fired && t.t >= t.warn) { t.fired = true; fireProjectile(t); }
      if (t.type === "circle" && !t.exploded && t.t >= t.warn) { t.exploded = true; explode(t.x, t.y, t.radius, t.damage, t.style); }
    }
    telegraphs = telegraphs.filter((t) => (t.type === "line" ? !t.fired : !t.exploded));
  }

  function updateLobs(dt) {
    for (const l of lobs) l.t += dt;
    lobs = lobs.filter((l) => l.t < l.dur);
  }

  function updateProjectiles(dt) {
    for (const p of projectiles) {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 7) p.trail.shift();
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (dist2(p.x, p.y, player.x, player.y) < (p.radius + player.radius) ** 2) {
        damagePlayer(p.damage); p.life = 0; burst(p.x, p.y, p.color, 12, 1.2);
      }
      if (p.x < -60 || p.x > W + 60 || p.y < -60 || p.y > H + 60) p.life = 0;
    }
    projectiles = projectiles.filter((p) => p.life > 0);
  }

  function updatePlayerShots(dt) {
    for (const s of playerShots) {
      // célkövetés (Ezreal E nyila)
      if (s.homing && s.target && !s.target.dead) {
        const desired = Math.atan2(s.target.y - s.y, s.target.x - s.x);
        const cur = Math.atan2(s.vy, s.vx);
        const na = angLerp(cur, desired, 0.18);
        const sp = len(s.vx, s.vy);
        s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
      }
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 9) s.trail.shift();
      const sx = s.vx * dt, sy = s.vy * dt;
      s.x += sx; s.y += sy; s.traveled += len(sx, sy);
      for (const e of enemies) {
        if (!e.dead && dist2(s.x, s.y, e.x, e.y) < (s.radius + e.radius) ** 2) {
          e.dead = true; kills++;
          burst(e.x, e.y, e.def.ring, 28, 2.2);
          floatText(e.x, e.y - 24, "+50", "#0ac8b9");
          s.traveled = BASIC_RANGE + 1; break;
        }
      }
      const range = s.homing ? 900 : BASIC_RANGE;
      if (s.traveled > range || s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) s.dead = true;
    }
    playerShots = playerShots.filter((s) => !s.dead);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.t += dt;
      if (p.ring) p.r = p.maxR * (p.t / p.dur);
      else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    }
    particles = particles.filter((p) => p.t < p.dur);
    for (const f of floaters) { f.t += dt; f.y -= 24 * dt; }
    floaters = floaters.filter((f) => f.t < f.dur);
  }

  // =======================================================================
  //  Rajzolás
  // =======================================================================
  function render() {
    ctx.clearRect(0, 0, W, H);
    if (bg.width > 1) ctx.drawImage(bg, 0, 0, W, H);
    drawSnow();
    drawTelegraphs();
    drawLobs();
    drawEnemies();
    drawProjectiles();
    drawPlayerShots();
    drawPlayer();
    drawParticles();
    drawFloaters();
    if (state === State.PLAYING) drawMoveTarget();
  }

  function drawMoveTarget() {
    const d = len(player.tx - player.x, player.ty - player.y);
    if (d > 6 && !player.dash) {
      ctx.strokeStyle = "rgba(10,200,185,0.5)"; ctx.lineWidth = 2;
      const pulse = 8 + Math.sin(elapsed * 12) * 2;
      ctx.beginPath(); ctx.arc(player.tx, player.ty, pulse, 0, TAU); ctx.stroke();
    }
  }

  function drawTelegraphs() {
    for (const t of telegraphs) {
      const k = clamp(t.t / t.warn, 0, 1);
      if (t.type === "line") {
        ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang);
        const rgb = hexRgb(t.color);
        ctx.fillStyle = `rgba(${rgb},${0.08 + 0.12 * k})`;
        ctx.fillRect(0, -t.width / 2, t.length, t.width);
        ctx.fillStyle = `rgba(${rgb},${0.34 * k})`;
        ctx.fillRect(0, -t.width / 2, t.length * k, t.width);
        ctx.strokeStyle = `rgba(${rgb},${0.5 + 0.4 * k})`; ctx.lineWidth = 2;
        ctx.strokeRect(0, -t.width / 2, t.length, t.width);
        ctx.restore();
      } else {
        ctx.strokeStyle = `rgba(255,140,90,${0.5 + 0.4 * k})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(t.x, t.y, t.radius, 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(255,120,70,${0.10 + 0.24 * k})`;
        ctx.beginPath(); ctx.arc(t.x, t.y, t.radius * k, 0, TAU); ctx.fill();
      }
    }
  }

  // Ziggs pattogó bombájának íve
  function drawLobs() {
    for (const l of lobs) {
      const k = clamp(l.t / l.dur, 0, 1);
      const x = l.sx + (l.tx - l.sx) * k;
      const y = l.sy + (l.ty - l.sy) * k;
      // pattogás: 2 ugrás
      const hop = Math.abs(Math.sin(k * Math.PI * 2)) * 46 * (1 - k * 0.4);
      const by = y - hop;
      // árnyék
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath(); ctx.ellipse(x, y, 10 * (1 - hop / 120), 4, 0, 0, TAU); ctx.fill();
      // bomba
      const g = ctx.createRadialGradient(x, by, 2, x, by, 12);
      g.addColorStop(0, "#ffd08a"); g.addColorStop(0.5, "#ff8a3a"); g.addColorStop(1, "#c04a10");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, by, 10, 0, TAU); ctx.fill();
      // szikra-kanóc
      ctx.fillStyle = "#fff2a0";
      ctx.beginPath(); ctx.arc(x + rand(-2, 2), by - 12 + rand(-2, 2), rand(1.5, 3), 0, TAU); ctx.fill();
    }
  }

  function drawEnemies() {
    for (const e of enemies) {
      const s = e.spawnAnim, def = e.def;
      ctx.save(); ctx.translate(e.x, e.y); ctx.scale(s, s);
      // varázslás-felvillanás
      if (e.castAnim > 0) {
        ctx.fillStyle = `rgba(255,255,255,${e.castAnim})`;
        ctx.beginPath(); ctx.arc(0, 0, e.radius + 14, 0, TAU); ctx.fill();
      }
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, e.radius + 11);
      g.addColorStop(0, def.glow); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, e.radius + 11, 0, TAU); ctx.fill();
      ctx.fillStyle = "#0e1620"; ctx.strokeStyle = def.ring; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, TAU); ctx.fill(); ctx.stroke();
      // bajnok kezdőbetűje
      ctx.fillStyle = def.ring; ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(def.name[0], 0, 1);
      ctx.restore();
      // név a bajnok fölött
      ctx.save();
      ctx.fillStyle = "rgba(230,240,255,0.55)";
      ctx.font = "10px 'Trebuchet MS', sans-serif"; ctx.textAlign = "center";
      ctx.fillText(def.name, e.x, e.y - e.radius - 8);
      ctx.restore();
    }
    ctx.textBaseline = "alphabetic";
  }

  // Skillshot-lövedékek — bajnokonként eltérő stílus
  function drawProjectiles() {
    for (const p of projectiles) {
      const rgb = hexRgb(p.color);
      // közös csóva
      for (let i = 0; i < p.trail.length; i++) {
        const a = (i / p.trail.length) * 0.45;
        ctx.fillStyle = `rgba(${rgb},${a})`;
        ctx.beginPath(); ctx.arc(p.trail[i].x, p.trail[i].y, p.radius * (i / p.trail.length), 0, TAU); ctx.fill();
      }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);

      if (p.style === "ezreal") {
        // vékony, megnyúlt arany villám-lövedék
        const g = ctx.createLinearGradient(-16, 0, 16, 0);
        g.addColorStop(0, "rgba(255,224,122,0)"); g.addColorStop(0.5, "#fff6d0"); g.addColorStop(1, "#ffd23a");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 0, 18, p.radius * 0.7, 0, 0, TAU); ctx.fill();
      } else if (p.style === "ryze") {
        // lila rúna-gömb, forgó belső jel
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, p.radius + 6);
        g.addColorStop(0, "#fff"); g.addColorStop(0.4, "#c79bff"); g.addColorStop(1, "rgba(120,60,220,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.radius + 5, 0, TAU); ctx.fill();
        ctx.rotate(elapsed * 6);
        ctx.strokeStyle = "rgba(240,220,255,0.85)"; ctx.lineWidth = 2;
        ctx.strokeRect(-p.radius * 0.5, -p.radius * 0.5, p.radius, p.radius);
      } else if (p.style === "ashe") {
        // nagy jeges kristálynyíl
        ctx.fillStyle = "#dff3ff";
        ctx.beginPath();
        ctx.moveTo(p.radius + 10, 0);
        ctx.lineTo(-p.radius, -p.radius * 0.8);
        ctx.lineTo(-p.radius * 0.4, 0);
        ctx.lineTo(-p.radius, p.radius * 0.8);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#7ec8ff"; ctx.lineWidth = 2; ctx.stroke();
        // jeges ragyogás
        ctx.fillStyle = "rgba(180,230,255,0.35)";
        ctx.beginPath(); ctx.arc(0, 0, p.radius + 6, 0, TAU); ctx.fill();
      } else if (p.style === "lux") {
        // ragyogó fénygömb-pár (Light Binding)
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, p.radius + 8);
        g.addColorStop(0, "#fff"); g.addColorStop(0.4, "#fff3a0"); g.addColorStop(1, "rgba(255,220,120,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(-5, 0, p.radius, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(6, 0, p.radius * 0.8, 0, TAU); ctx.fill();
      } else {
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, p.radius + 6);
        g.addColorStop(0, "#fff"); g.addColorStop(0.4, p.color); g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.radius + 5, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPlayerShots() {
    for (const s of playerShots) {
      const rgb = hexRgb(s.color);
      for (let i = 1; i < s.trail.length; i++) {
        const a = (i / s.trail.length) * 0.5;
        ctx.strokeStyle = `rgba(${rgb},${a})`; ctx.lineWidth = s.radius * (i / s.trail.length);
        ctx.beginPath(); ctx.moveTo(s.trail[i - 1].x, s.trail[i - 1].y); ctx.lineTo(s.trail[i].x, s.trail[i].y); ctx.stroke();
      }
      const g = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, s.radius + 5);
      g.addColorStop(0, "#fff"); g.addColorStop(0.5, s.color); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, s.radius + 5, 0, TAU); ctx.fill();
    }
  }

  function drawPlayer() {
    // gurulás-szellemképek
    for (const gh of player.ghosts) {
      const a = 1 - gh.t / 0.25;
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = gh.color;
      ctx.beginPath(); ctx.arc(gh.x, gh.y, PLAYER.radius, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.save(); ctx.translate(player.x, player.y);
    if (player.hitFlash > 0) {
      ctx.fillStyle = `rgba(224,74,74,${player.hitFlash * 1.5})`;
      ctx.beginPath(); ctx.arc(0, 0, PLAYER.radius + 14, 0, TAU); ctx.fill();
    }
    const acc = hexRgb(player.champ.accent);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, PLAYER.radius + 14);
    g.addColorStop(0, `rgba(${acc},0.55)`); g.addColorStop(1, `rgba(${acc},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, PLAYER.radius + 14, 0, TAU); ctx.fill();
    ctx.fillStyle = "#12212f"; ctx.strokeStyle = player.champ.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, PLAYER.radius, 0, TAU); ctx.fill(); ctx.stroke();
    // hős kezdőbetűje
    ctx.fillStyle = player.champ.accent; ctx.font = "bold 15px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(player.champ.name[0], 0, 1);
    ctx.textBaseline = "alphabetic";
    // irány-nyíl
    ctx.rotate(player.facing);
    ctx.fillStyle = "#0ac8b9";
    ctx.beginPath();
    ctx.moveTo(PLAYER.radius + 4, 0); ctx.lineTo(PLAYER.radius - 5, -6); ctx.lineTo(PLAYER.radius - 5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = 1 - p.t / p.dur;
      ctx.globalAlpha = alpha;
      if (p.ring) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
      } else {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawFloaters() {
    ctx.textAlign = "center"; ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
    for (const f of floaters) {
      ctx.globalAlpha = 1 - f.t / f.dur; ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y); ctx.globalAlpha = 1;
    }
  }

  // "#rrggbb" -> "r,g,b"
  const _rgbCache = {};
  function hexRgb(hex) {
    if (_rgbCache[hex]) return _rgbCache[hex];
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return (_rgbCache[hex] = `${r},${g},${b}`);
  }

  // =======================================================================
  //  HUD
  // =======================================================================
  const el = {
    hud: document.getElementById("hud"),
    score: document.getElementById("score"),
    wave: document.getElementById("wave"),
    best: document.getElementById("best"),
    hpbar: document.getElementById("hpbar"),
    hptext: document.getElementById("hptext"),
    abBasic: document.getElementById("ab-basic"),
    abAbility: document.getElementById("ab-ability"),
    abFlash: document.getElementById("ab-flash"),
    startScreen: document.getElementById("start-screen"),
    selectScreen: document.getElementById("select-screen"),
    overScreen: document.getElementById("over-screen"),
  };
  const cdBasic = el.abBasic.querySelector(".ab-cd");
  const cdAbility = el.abAbility.querySelector(".ab-cd");
  const cdFlash = el.abFlash.querySelector(".ab-cd");

  function updateHUD() {
    el.score.textContent = score;
    el.wave.textContent = wave;
    el.best.textContent = best;
    const hpPct = clamp(player.hp / PLAYER.maxHp, 0, 1);
    el.hpbar.style.width = (hpPct * 100) + "%";
    el.hpbar.style.background = hpPct > 0.5 ? "linear-gradient(180deg,#4fe07a,#24a34e)"
      : hpPct > 0.25 ? "linear-gradient(180deg,#e0c94f,#a3861f)"
      : "linear-gradient(180deg,#e04a4a,#a31f1f)";
    el.hptext.textContent = Math.ceil(player.hp) + " / " + PLAYER.maxHp;

    cdBasic.style.transform = `scaleY(${player.basicCd / BASIC_CD})`;
    cdAbility.style.transform = `scaleY(${player.abilityCd / player.champ.abilityCd})`;
    cdFlash.style.transform = `scaleY(${player.flashCd / FLASH_CD})`;
    el.abBasic.classList.toggle("ready", player.basicCd <= 0);
    el.abAbility.classList.toggle("ready", player.abilityCd <= 0);
    el.abFlash.classList.toggle("ready", player.flashCd <= 0);
  }

  function configureAbilityHUD() {
    const c = CHAMPIONS[chosenChamp];
    el.abAbility.querySelector(".ab-key").textContent = c.abilityKey;
    el.abAbility.querySelector(".ab-name").textContent = c.abilityName;
  }

  // =======================================================================
  //  Vezérlés
  // =======================================================================
  function showSelect() {
    state = State.SELECT;
    el.startScreen.classList.add("hidden");
    el.overScreen.classList.add("hidden");
    el.selectScreen.classList.remove("hidden");
  }

  function startGame() {
    configureAbilityHUD();
    resetGame();
    mouse.x = W / 2; mouse.y = H / 2;
    state = State.PLAYING;
    el.selectScreen.classList.add("hidden");
    el.startScreen.classList.add("hidden");
    el.overScreen.classList.add("hidden");
    el.hud.classList.remove("hidden");
  }

  function gameOver() {
    state = State.OVER;
    if (score > best) { best = score; localStorage.setItem(BEST_KEY, String(best)); }
    document.getElementById("final-time").textContent = elapsed.toFixed(1) + " mp";
    document.getElementById("final-score").textContent = score;
    document.getElementById("final-best").textContent = best;
    document.getElementById("final-kills").textContent = kills;
    el.hud.classList.add("hidden");
    el.overScreen.classList.remove("hidden");
  }

  document.getElementById("start-btn").addEventListener("click", showSelect);
  document.getElementById("retry-btn").addEventListener("click", startGame);
  document.getElementById("change-btn").addEventListener("click", showSelect);
  document.querySelectorAll(".champ-card").forEach((card) => {
    card.addEventListener("click", () => { chosenChamp = card.dataset.champ; startGame(); });
  });

  // =======================================================================
  //  Fő ciklus
  // =======================================================================
  resize();
  resetGame();

  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000; last = now;
    dt = Math.min(dt, 0.05);
    if (state === State.PLAYING) { update(dt); updateHUD(); }
    updateSnow(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
