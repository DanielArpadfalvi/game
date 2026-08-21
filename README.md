# Rift Dodge — Skillshot Aréna

Böngészőből játszható, **League of Legends-inspirált** skillshot-kitérős aréna.
**Phaser 3 + TypeScript + Vite** motorra építve. **Szóló** és **valós idejű
többjátékos** (Supabase Realtime) móddal.

> ⚠️ A játékmenet és a kód eredeti. A **bajnok-képek** a Riot Games tulajdonát
> képezik, és a hivatalos **Data Dragon** CDN-ről töltődnek le (fan / nem-kommersz
> használat a Riot feltételei szerint). A képfájlok nincsenek verziózva a repóban.

## Stack

- **Phaser 3.90** — 2D játékmotor (jelenetek, sprite/asset pipeline, particle rendszer, input)
- **TypeScript** (strict), **Vite** dev/build
- Valódi bajnok-arcok kör-tokenre vágva; ha az asset hiányzik, **placeholder** grafika fut

## Futtatás

```bash
npm install
npm run fetch-assets   # letölti a valódi bajnok-képeket (Data Dragon)
npm run dev            # fejlesztői szerver → http://localhost:5173
```

Éles build: `npm run build` → `dist/` (bármely statikus tárhelyre kitehető:
Vercel / Netlify / GitHub Pages). Előnézet: `npm run preview`.

> A `fetch-assets` a rendszer `curl`-jét használja, így proxy mögött is működik.
> Ha a hálózat blokkolja a `ddragon.leagueoflegends.com` hosztot, engedélyezd a
> környezet hálózati szabályában, vagy futtasd a saját gépeden és commitold a
> `public/assets/champions/` mappát.

## Irányítás (mint az igazi LoL-ban)

| Bemenet | Hatás |
|---------|-------|
| **Jobb klikk** | A bajnok odasétál a kattintott pontra |
| **Bal klikk** | Alaptámadás a kurzor felé (ellenség kilövése +50 pont) |
| **Hős-skill** | Ezreal: **E** (Arcane Shift) · Vayne: **Q** (Tumble) |
| **F** | Flash — rövid villanás a kurzor irányába (5 mp cooldown) |

## Többjátékos mód (aréna)

A főmenü **TÖBBJÁTÉKOS — LOBBI** gombjával indul. A hálózat **Supabase
Realtime** broadcast/presence csatornákra épül — nincs saját játékszerver,
statikus tárhelyről is működik.

- **Lobbi & meghívás:** *Új szoba (host)* létrehoz egy 5 karakteres szobakódot.
  A **[link]** gombbal a meghívó URL (`?room=KÓD`) a vágólapra kerül — akinek
  elküldöd, a link megnyitásával egyből a lobbiba csöppen. Vagy *Csatlakozás
  kóddal*. Névváltás és hősválasztás a lobbiban; a host a *START*-tal indít,
  amikor mindenki *kész*.
- **Automata lövés:** nem kell kattintani — a hősöd magától a legközelebbi
  ellenfélre (játékos vagy NPC) tüzel. Kattintással (bal/jobb) mozogsz.
- **PvP + NPC-k:** egymásra is lövöldöztök, közben a pálya szélén továbbra is
  megjelennek az NPC-bajnokok a jellegzetes skillshotjaikkal (a host futtatja).
- **Power-upok a mapon:**
  - **⛨ Pajzs** — elnyel 60 sebzést a HP előtt.
  - **★ Sebezhetetlenség** — 5 mp teljes védettség.
  - **⚡ Lövés-fejlesztés** — gyorsabb, erősebb, több lövedékű támadás; halmozódik
    (max 4 szint), időzített.
- **Kiesés/újraéledés:** 0 HP után rövid újraéledés a pálya közepén; ranglista
  és killfeed a HUD-on. **ESC** — vissza a lobbiba.

### Hálózati beállítás

Alapból egy beégetett (nyilvános anon kulcsú) Supabase projekthez kapcsolódik,
így deploy után azonnal működik. Saját projekt használatához add meg build-időben:

```bash
VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_ANON_KEY=<anon> npm run build
```

> A Supabase **anon** kulcs kliensbe szánt, nyilvános kulcs — biztonságos a
> kliensbe/repóba kerülnie.

## Játszható hősök

- **Ezreal — Arcane Shift (E):** villanás a kurzor felé + célkövető nyíl a legközelebbi ellenségre.
- **Vayne — Tumble (Q):** gyors gurulás, rövid cooldownnal, i-frame-ekkel.

## Ellenséges bajnokok (jellegzetes skillshotok)

| Bajnok | Skillshot | Stílus |
|--------|-----------|--------|
| **Ezreal** | Mystic Shot | gyors, vékony arany lövedék |
| **Ryze** | Overload | lila-kék rúna-lövés, közepes |
| **Ziggs** | Bouncing Bomb | pattogó bomba → narancs AoE robbanás |
| **Ashe** | Enchanted Crystal Arrow | lassú, nagy jeges nyíl |
| **Lux** | Light Binding | ragyogó arany-fehér fénygömb |

## Pálya

**Howling Abyss** (ARAM) ihlette téli híd: fagyott kőkorlátok, rúna-embléma,
particle-alapú havazás, a szakadék a pálya két éle mentén.

## Projektstruktúra

```
index.html              # Vite belépő
src/
  main.ts               # Phaser.Game konfiguráció
  data.ts               # hősök, skillshotok, balansz, power-up + aréna konstansok
  helpers.ts            # token/portré sütés, közös textúrák, gomb
  bg.ts                 # téli Howling Abyss háttér
  net/
    config.ts           # Supabase URL + anon kulcs (env-felülírható)
    net.ts              # Realtime netcode: presence (lobbi) + broadcast (játék)
  scenes/
    BootScene.ts        # asset-betöltés + placeholder fallback
    MenuScene.ts
    SelectScene.ts      # hősválasztás (szóló)
    GameScene.ts        # szóló játékmenet (mozgás, skillshotok, ütközés)
    UIScene.ts          # szóló HUD
    LobbyScene.ts       # többjátékos lobbi (szoba, meghívás, ready)
    ArenaScene.ts       # többjátékos aréna (PvP, NPC-k, power-upok)
    ArenaUIScene.ts     # aréna HUD (HP/pajzs, buffok, ranglista, killfeed)
scripts/fetch-assets.mjs
public/assets/champions/  # Data Dragon képek (nincs verziózva)
legacy/canvas-prototype/  # a korábbi tiszta-Canvas prototípus
```

## Következő lépések

- Valódi bajnok-**sprite-animációk** (Community Dragon), több skillshot-típus.
- Több hős, mélyebb kit (pl. Vayne Silver Bolts, Ezreal passzív).
- Retenció: napi kihívás fix seeddel + streak, ranglista.
