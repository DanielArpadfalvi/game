"use strict";

/* =========================================================================
   RIFT DODGE — Skillshot Aréna (prototípus)
   Egyjátékos, böngészős. LoL-szerű vezérlés:
     - Jobb klikk : mozgás a kattintott pontra (a bajnok odasétál)
     - Bal klikk  : Villám skillshot lövése a kurzor felé
     - F          : Flash (villanás a kurzor irányába, rövid táv)
   Cél: térj ki a feléd repülő, előre jelzett (telegraph) skillshotok elől.
   ========================================================================= */

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // ---- Világ-méret (logikai pixelek, DPI-független) ----
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
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- Matek segédek ----
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  const len = (x, y) => Math.hypot(x, y);

  // =======================================================================
  //  Állapot
  // =======================================================================
  const State = { MENU: 0, PLAYING: 1, OVER: 2 };
  let state = State.MENU;

  const BEST_KEY = "riftdodge_best";
  let best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10);

  const mouse = { x: W / 2, y: H / 2 };

  let player, enemies, telegraphs, projectiles, playerShots, particles, floaters;
  let elapsed, score, wave, kills, spawnTimer, difficulty, waveTimer;

  // ---- Játékos-beállítások ----
  const PLAYER = {
    radius: 16,
    speed: 340,          // px / mp — mozgássebesség (LoL-szerű "haladás")
    maxHp: 100,
  };
  const FLASH_RANGE = 250;
  const FLASH_CD = 5.0;
  const Q_CD = 0.55;
  const Q_SPEED = 900;
  const Q_RANGE = 700;

  function resetGame() {
    player = {
      x: W / 2, y: H / 2,
      tx: W / 2, ty: H / 2,   // mozgás célpont
      hp: PLAYER.maxHp,
      flashCd: 0,
      qCd: 0,
      facing: 0,
      hitFlash: 0,
    };
    enemies = [];
    telegraphs = [];
    projectiles = [];
    playerShots = [];
    particles = [];
    floaters = [];
    elapsed = 0;
    score = 0;
    wave = 1;
    kills = 0;
    difficulty = 1;
    spawnTimer = 0.8;
    waveTimer = 0;
  }

  // =======================================================================
  //  Entitás-létrehozók
  // =======================================================================

  // Ellenséges varázsló, aki a pálya szélén jelenik meg és skillshotokat lő
  function spawnEnemy() {
    const margin = 60;
    const edge = Math.floor(rand(0, 4));
    let x, y;
    if (edge === 0) { x = rand(margin, W - margin); y = margin; }
    else if (edge === 1) { x = W - margin; y = rand(margin, H - margin); }
    else if (edge === 2) { x = rand(margin, W - margin); y = H - margin; }
    else { x = margin; y = rand(margin, H - margin); }

    enemies.push({
      x, y,
      radius: 20,
      hp: 1,
      fireTimer: rand(1.2, 2.4) / difficulty,
      // "drift" a szél mentén, hogy ne álljon egy helyben
      drift: rand(-1, 1),
      spawnAnim: 0,
      dead: false,
    });
  }

  // Telegraph = előjelzés. type: "line" (egyenes skillshot) vagy "circle" (AoE becsapódás)
  function addLineTelegraph(sx, sy, tx, ty, opts) {
    const ang = Math.atan2(ty - sy, tx - sx);
    telegraphs.push({
      type: "line",
      x: sx, y: sy, ang,
      width: opts.width,
      length: opts.length,
      warn: opts.warn,
      t: 0,
      damage: opts.damage,
      speed: opts.speed,
      color: opts.color,
      fired: false,
    });
  }

  function addCircleTelegraph(x, y, opts) {
    telegraphs.push({
      type: "circle",
      x, y,
      radius: opts.radius,
      warn: opts.warn,
      t: 0,
      damage: opts.damage,
      exploded: false,
    });
  }

  function fireProjectile(x, y, ang, opts) {
    projectiles.push({
      x, y,
      vx: Math.cos(ang) * opts.speed,
      vy: Math.sin(ang) * opts.speed,
      radius: opts.width * 0.5,
      damage: opts.damage,
      color: opts.color,
      life: 3.0,
      trail: [],
    });
  }

  function explode(x, y, radius, damage) {
    // damage-zóna: azonnali robbanás, kör alakú találat
    burst(x, y, "#ff7a4a", 26, 3.6);
    if (dist2(player.x, player.y, x, y) < (radius + player.radius) ** 2) {
      damagePlayer(damage);
    }
    // sokkhullám részecske
    particles.push({ ring: true, x, y, r: 4, maxR: radius, t: 0, dur: 0.35, color: "#ff7a4a" });
  }

  // =======================================================================
  //  Effektek
  // =======================================================================
  function burst(x, y, color, count, speedScale) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, TAU);
      const s = rand(40, 220) * (speedScale || 1);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        r: rand(1.5, 3.5),
        t: 0,
        dur: rand(0.3, 0.7),
        color,
      });
    }
  }

  function floatText(x, y, text, color) {
    floaters.push({ x, y, text, color, t: 0, dur: 0.9 });
  }

  // =======================================================================
  //  Sérülés
  // =======================================================================
  function damagePlayer(amount) {
    if (state !== State.PLAYING) return;
    player.hp -= amount;
    player.hitFlash = 0.25;
    burst(player.x, player.y, "#e04a4a", 14, 1.4);
    floatText(player.x, player.y - 26, "-" + amount, "#ff6b6b");
    if (player.hp <= 0) {
      player.hp = 0;
      gameOver();
    }
  }

  // =======================================================================
  //  Bemenet
  // =======================================================================
  canvas.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  // Jobb klikk = mozgás (mint a LoL-ban). Megakadályozzuk a kontextusmenüt.
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (state !== State.PLAYING) return;
    player.tx = clamp(e.clientX, 0, W);
    player.ty = clamp(e.clientY, 0, H);
    // kis mozgás-jelző
    particles.push({ ring: true, x: player.tx, y: player.ty, r: 2, maxR: 16, t: 0, dur: 0.4, color: "#0ac8b9" });
  });

  // Bal klikk = Villám (Q). Egérrel mozgunk, bal klikkel lövünk — LoL-szerű elrendezés.
  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (state !== State.PLAYING) return;
    castQ();
  });

  window.addEventListener("keydown", (e) => {
    if (state !== State.PLAYING) return;
    const k = e.key.toLowerCase();
    if (k === "f") { castFlash(); }
    if (k === "q") { castQ(); } // alternatíva a bal klikkre
  });

  function castQ() {
    if (player.qCd > 0) return;
    player.qCd = Q_CD;
    const ang = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    player.facing = ang;
    playerShots.push({
      x: player.x + Math.cos(ang) * PLAYER.radius,
      y: player.y + Math.sin(ang) * PLAYER.radius,
      vx: Math.cos(ang) * Q_SPEED,
      vy: Math.sin(ang) * Q_SPEED,
      radius: 8,
      traveled: 0,
      trail: [],
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
    // a mozgás-célt is odarakjuk, hogy ne sétáljon vissza
    player.tx = player.x;
    player.ty = player.y;
    burst(player.x, player.y, "#0ac8b9", 22, 1.6);
  }

  // =======================================================================
  //  Frissítés (update)
  // =======================================================================
  function update(dt) {
    elapsed += dt;
    // pontszám: túlélési idő + kilövések
    score = Math.floor(elapsed * 10) + kills * 50;
    difficulty = 1 + elapsed / 22;   // fokozatos nehezedés

    // hullám számláló
    waveTimer += dt;
    if (waveTimer >= 15) { waveTimer = 0; wave++; floatText(W / 2, 80, "HULLÁM " + wave, "#c8aa6e"); }

    updatePlayer(dt);
    updateSpawns(dt);
    updateEnemies(dt);
    updateTelegraphs(dt);
    updateProjectiles(dt);
    updatePlayerShots(dt);
    updateParticles(dt);
  }

  function updatePlayer(dt) {
    player.flashCd = Math.max(0, player.flashCd - dt);
    player.qCd = Math.max(0, player.qCd - dt);
    player.hitFlash = Math.max(0, player.hitFlash - dt);

    // mozgás a célpont felé, állandó sebességgel (LoL "click to move")
    const dx = player.tx - player.x;
    const dy = player.ty - player.y;
    const d = len(dx, dy);
    if (d > 1) {
      const step = Math.min(d, PLAYER.speed * dt);
      player.x += (dx / d) * step;
      player.y += (dy / d) * step;
      player.facing = Math.atan2(dy, dx);
    }
    player.x = clamp(player.x, PLAYER.radius, W - PLAYER.radius);
    player.y = clamp(player.y, PLAYER.radius, H - PLAYER.radius);
  }

  function updateSpawns(dt) {
    spawnTimer -= dt;
    const maxEnemies = Math.min(3 + Math.floor(elapsed / 12), 9);
    if (spawnTimer <= 0 && enemies.length < maxEnemies) {
      spawnEnemy();
      spawnTimer = rand(1.6, 3.2) / Math.sqrt(difficulty);
    }
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      if (e.spawnAnim < 1) e.spawnAnim = Math.min(1, e.spawnAnim + dt * 3);

      // lassú sodródás a szél mentén, hogy éljen a pálya
      e.x += e.drift * 18 * dt;
      e.y += Math.cos(elapsed + e.x) * 6 * dt;
      e.x = clamp(e.x, 40, W - 40);
      e.y = clamp(e.y, 40, H - 40);

      e.fireTimer -= dt;
      if (e.fireTimer <= 0) {
        chooseAttack(e);
        e.fireTimer = rand(1.6, 3.0) / difficulty;
      }
    }
    enemies = enemies.filter((e) => !e.dead);
  }

  // Az ellenség kiválasztja és "megcélozza" a támadást (telegraph-fal)
  function chooseAttack(e) {
    const roll = Math.random();
    if (roll < 0.62) {
      // Egyenes skillshot a játékos jelenlegi (kicsit előrejelzett) pozíciójára
      const lead = 0.12; // enyhe elővezetés
      const px = player.x + (player.tx - player.x) * lead;
      const py = player.y + (player.ty - player.y) * lead;
      addLineTelegraph(e.x, e.y, px, py, {
        width: 22,
        length: 1600,
        warn: clamp(0.85 - difficulty * 0.05, 0.45, 0.85),
        damage: 18,
        speed: 620 + difficulty * 40,
        color: "#e04a4a",
      });
    } else if (roll < 0.85) {
      // AoE becsapódás a játékos alá (ki kell sétálni belőle)
      addCircleTelegraph(player.x, player.y, {
        radius: 78,
        warn: clamp(1.0 - difficulty * 0.05, 0.55, 1.0),
        damage: 26,
      });
    } else {
      // Legyező: három egyenes skillshot
      const baseAng = Math.atan2(player.y - e.y, player.x - e.x);
      for (let i = -1; i <= 1; i++) {
        const a = baseAng + i * 0.22;
        addLineTelegraph(e.x, e.y, e.x + Math.cos(a) * 400, e.y + Math.sin(a) * 400, {
          width: 18,
          length: 1600,
          warn: 0.7,
          damage: 15,
          speed: 640,
          color: "#e07a4a",
        });
      }
    }
  }

  function updateTelegraphs(dt) {
    for (const t of telegraphs) {
      t.t += dt;
      if (t.type === "line" && !t.fired && t.t >= t.warn) {
        t.fired = true;
        fireProjectile(t.x, t.y, t.ang, {
          speed: t.speed, width: t.width, damage: t.damage, color: t.color,
        });
      }
      if (t.type === "circle" && !t.exploded && t.t >= t.warn) {
        t.exploded = true;
        explode(t.x, t.y, t.radius, t.damage);
      }
    }
    telegraphs = telegraphs.filter((t) => {
      if (t.type === "line") return !t.fired;
      return !t.exploded;
    });
  }

  function updateProjectiles(dt) {
    for (const p of projectiles) {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 6) p.trail.shift();
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      // találat a játékoson
      if (dist2(p.x, p.y, player.x, player.y) < (p.radius + player.radius) ** 2) {
        damagePlayer(p.damage);
        p.life = 0;
        burst(p.x, p.y, p.color, 12, 1.2);
      }
      if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) p.life = 0;
    }
    projectiles = projectiles.filter((p) => p.life > 0);
  }

  function updatePlayerShots(dt) {
    for (const s of playerShots) {
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 8) s.trail.shift();
      const stepx = s.vx * dt, stepy = s.vy * dt;
      s.x += stepx;
      s.y += stepy;
      s.traveled += len(stepx, stepy);
      // találat ellenségen
      for (const e of enemies) {
        if (!e.dead && dist2(s.x, s.y, e.x, e.y) < (s.radius + e.radius) ** 2) {
          e.dead = true;
          kills++;
          burst(e.x, e.y, "#0ac8b9", 26, 2.2);
          floatText(e.x, e.y - 24, "+50", "#0ac8b9");
          s.traveled = Q_RANGE + 1;
          break;
        }
      }
      if (s.traveled > Q_RANGE || s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) {
        s.dead = true;
      }
    }
    playerShots = playerShots.filter((s) => !s.dead);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.t += dt;
      if (p.ring) {
        p.r = p.maxR * (p.t / p.dur);
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
      }
    }
    particles = particles.filter((p) => p.t < p.dur);

    for (const f of floaters) { f.t += dt; f.y -= 24 * dt; }
    floaters = floaters.filter((f) => f.t < f.dur);
  }

  // =======================================================================
  //  Rajzolás (render)
  // =======================================================================
  function render() {
    ctx.clearRect(0, 0, W, H);
    drawArena();
    drawTelegraphs();
    drawEnemies();
    drawProjectiles();
    drawPlayerShots();
    drawPlayer();
    drawParticles();
    drawFloaters();
    if (state === State.PLAYING) drawMoveTarget();
  }

  function drawArena() {
    // rácsos "Rift" padló
    ctx.save();
    ctx.strokeStyle = "rgba(200,170,110,0.05)";
    ctx.lineWidth = 1;
    const grid = 64;
    for (let x = 0; x <= W; x += grid) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += grid) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    // dekoratív középső kör
    ctx.strokeStyle = "rgba(10,200,185,0.06)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.32, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function drawMoveTarget() {
    // finom jelző a mozgás-célnál, ha még haladunk
    const d = len(player.tx - player.x, player.ty - player.y);
    if (d > 6) {
      ctx.save();
      ctx.strokeStyle = "rgba(10,200,185,0.5)";
      ctx.lineWidth = 2;
      const pulse = 8 + Math.sin(elapsed * 12) * 2;
      ctx.beginPath();
      ctx.arc(player.tx, player.ty, pulse, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawTelegraphs() {
    for (const t of telegraphs) {
      const k = clamp(t.t / t.warn, 0, 1);
      if (t.type === "line") {
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.ang);
        // növekvő piros sáv, ami "megtelik" a becsapódásig
        ctx.fillStyle = `rgba(224,74,74,${0.10 + 0.14 * k})`;
        ctx.fillRect(0, -t.width / 2, t.length, t.width);
        // belső, feltöltődő rész
        ctx.fillStyle = `rgba(255,90,90,${0.35 * k})`;
        ctx.fillRect(0, -t.width / 2, t.length * k, t.width);
        // körvonal
        ctx.strokeStyle = `rgba(255,120,120,${0.5 + 0.4 * k})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -t.width / 2, t.length, t.width);
        ctx.restore();
      } else {
        ctx.save();
        ctx.strokeStyle = `rgba(255,120,90,${0.5 + 0.4 * k})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,90,60,${0.12 + 0.22 * k})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius * k, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawEnemies() {
    for (const e of enemies) {
      const s = e.spawnAnim;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(s, s);
      // külső aura
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, e.radius + 10);
      g.addColorStop(0, "rgba(224,74,74,0.9)");
      g.addColorStop(1, "rgba(120,20,20,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, e.radius + 10, 0, TAU); ctx.fill();
      // test
      ctx.fillStyle = "#2a1418";
      ctx.strokeStyle = "#e04a4a";
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0, 0, e.radius, 0, TAU); ctx.fill(); ctx.stroke();
      // belső "szem"
      ctx.fillStyle = "#ff8a8a";
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawProjectiles() {
    for (const p of projectiles) {
      // csóva
      for (let i = 0; i < p.trail.length; i++) {
        const a = (i / p.trail.length) * 0.4;
        ctx.fillStyle = `rgba(255,90,90,${a})`;
        ctx.beginPath();
        ctx.arc(p.trail[i].x, p.trail[i].y, p.radius * (i / p.trail.length), 0, TAU);
        ctx.fill();
      }
      const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, p.radius + 6);
      g.addColorStop(0, "#fff");
      g.addColorStop(0.4, p.color);
      g.addColorStop(1, "rgba(224,74,74,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 6, 0, TAU); ctx.fill();
    }
  }

  function drawPlayerShots() {
    for (const s of playerShots) {
      for (let i = 0; i < s.trail.length; i++) {
        const a = (i / s.trail.length) * 0.5;
        ctx.strokeStyle = `rgba(10,200,185,${a})`;
        ctx.lineWidth = s.radius * (i / s.trail.length);
        if (i > 0) {
          ctx.beginPath();
          ctx.moveTo(s.trail[i - 1].x, s.trail[i - 1].y);
          ctx.lineTo(s.trail[i].x, s.trail[i].y);
          ctx.stroke();
        }
      }
      const g = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, s.radius + 5);
      g.addColorStop(0, "#fff");
      g.addColorStop(0.5, "#0ac8b9");
      g.addColorStop(1, "rgba(10,200,185,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.radius + 5, 0, TAU); ctx.fill();
    }
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(player.x, player.y);

    // találat-villanás
    if (player.hitFlash > 0) {
      ctx.fillStyle = `rgba(224,74,74,${player.hitFlash * 1.5})`;
      ctx.beginPath(); ctx.arc(0, 0, PLAYER.radius + 14, 0, TAU); ctx.fill();
    }

    // aura
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, PLAYER.radius + 14);
    g.addColorStop(0, "rgba(200,170,110,0.55)");
    g.addColorStop(1, "rgba(200,170,110,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, PLAYER.radius + 14, 0, TAU); ctx.fill();

    // test
    ctx.fillStyle = "#12212f";
    ctx.strokeStyle = "#f0e6d2";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, PLAYER.radius, 0, TAU); ctx.fill(); ctx.stroke();

    // irány-jelző (facing)
    ctx.rotate(player.facing);
    ctx.fillStyle = "#0ac8b9";
    ctx.beginPath();
    ctx.moveTo(PLAYER.radius + 2, 0);
    ctx.lineTo(PLAYER.radius - 6, -6);
    ctx.lineTo(PLAYER.radius - 6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = 1 - p.t / p.dur;
      if (p.ring) {
        ctx.strokeStyle = p.color.replace(")", `,${alpha})`).replace("rgb", "rgba");
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawFloaters() {
    ctx.textAlign = "center";
    ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
    for (const f of floaters) {
      const alpha = 1 - f.t / f.dur;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  // =======================================================================
  //  HUD frissítés (DOM)
  // =======================================================================
  const el = {
    hud: document.getElementById("hud"),
    score: document.getElementById("score"),
    wave: document.getElementById("wave"),
    best: document.getElementById("best"),
    hpbar: document.getElementById("hpbar"),
    hptext: document.getElementById("hptext"),
    abQ: document.getElementById("ab-q"),
    abFlash: document.getElementById("ab-flash"),
    startScreen: document.getElementById("start-screen"),
    overScreen: document.getElementById("over-screen"),
  };
  const cdQ = el.abQ.querySelector(".ab-cd");
  const cdFlash = el.abFlash.querySelector(".ab-cd");

  function updateHUD() {
    el.score.textContent = score;
    el.wave.textContent = wave;
    el.best.textContent = best;
    const hpPct = clamp(player.hp / PLAYER.maxHp, 0, 1);
    el.hpbar.style.width = (hpPct * 100) + "%";
    el.hpbar.style.background = hpPct > 0.5
      ? "linear-gradient(180deg,#4fe07a,#24a34e)"
      : hpPct > 0.25
      ? "linear-gradient(180deg,#e0c94f,#a3861f)"
      : "linear-gradient(180deg,#e04a4a,#a31f1f)";
    el.hptext.textContent = Math.ceil(player.hp) + " / " + PLAYER.maxHp;

    cdQ.style.transform = `scaleY(${player.qCd / Q_CD})`;
    cdFlash.style.transform = `scaleY(${player.flashCd / FLASH_CD})`;
    el.abQ.classList.toggle("ready", player.qCd <= 0);
    el.abFlash.classList.toggle("ready", player.flashCd <= 0);
  }

  // =======================================================================
  //  Játékmenet-vezérlés
  // =======================================================================
  function startGame() {
    resetGame();
    state = State.PLAYING;
    el.startScreen.classList.add("hidden");
    el.overScreen.classList.add("hidden");
    el.hud.classList.remove("hidden");
  }

  function gameOver() {
    state = State.OVER;
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
    }
    document.getElementById("final-time").textContent = elapsed.toFixed(1) + " mp";
    document.getElementById("final-score").textContent = score;
    document.getElementById("final-best").textContent = best;
    document.getElementById("final-kills").textContent = kills;
    el.hud.classList.add("hidden");
    el.overScreen.classList.remove("hidden");
  }

  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("retry-btn").addEventListener("click", startGame);

  // =======================================================================
  //  Fő ciklus
  // =======================================================================
  resetGame(); // hogy a menü-render alatt is létezzenek az entitás-tömbök

  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.05); // védelem nagy ugrások ellen (pl. tab-váltás)

    if (state === State.PLAYING) {
      update(dt);
      updateHUD();
    }
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
