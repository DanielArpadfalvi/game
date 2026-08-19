/* =========================================================================
   Rift Dodge — adatréteg
   Hősök, skillshot-definíciók és a Data Dragon asset-manifeszt.
   Minden szín Phaser-formátumú hex szám (0xrrggbb).
   ========================================================================= */

export interface LineShot {
  kind: "line";
  style: "ezreal" | "ryze" | "ashe" | "lux";
  width: number;
  speed: number;
  warn: number; // telegraph ideje mp-ben
  dmg: number;
  color: number;
  length: number;
}

export interface BombShot {
  kind: "bomb";
  style: "ziggs";
  radius: number;
  lob: number; // repülési idő mp-ben
  dmg: number;
  color: number;
}

export type Shot = LineShot | BombShot;

export interface AttackerDef {
  key: string;
  name: string;
  ddragon: string; // Data Dragon bajnok-azonosító
  color: number;
  ring: number;
  glow: number;
  shot: Shot;
}

export interface ChampionDef {
  key: string;
  name: string;
  ddragon: string;
  role: string;
  color: number;
  accent: number;
  abilityKey: string; // "E" / "Q"
  abilityName: string;
  abilityDesc: string;
  abilityCd: number;
  ability: "arcaneShift" | "tumble";
}

/* ---- Ellenséges bajnokok jellegzetes skillshotjai ---- */
export const ATTACKERS: AttackerDef[] = [
  {
    key: "ezreal", name: "Ezreal", ddragon: "Ezreal",
    color: 0xf4c542, ring: 0xffe07a, glow: 0xffe07a,
    shot: { kind: "line", style: "ezreal", width: 15, speed: 1150, warn: 0.42, dmg: 15, color: 0xffe07a, length: 2400 },
  },
  {
    key: "ryze", name: "Ryze", ddragon: "Ryze",
    color: 0x7a4fc4, ring: 0xb48cff, glow: 0x966ef0,
    shot: { kind: "line", style: "ryze", width: 28, speed: 720, warn: 0.6, dmg: 18, color: 0xa26cff, length: 2400 },
  },
  {
    key: "ziggs", name: "Ziggs", ddragon: "Ziggs",
    color: 0xe8842e, ring: 0xffb14a, glow: 0xff963c,
    shot: { kind: "bomb", style: "ziggs", radius: 90, lob: 0.85, dmg: 24, color: 0xff8a3a },
  },
  {
    key: "ashe", name: "Ashe", ddragon: "Ashe",
    color: 0x4aa8e0, ring: 0xaee3ff, glow: 0x78c8ff,
    shot: { kind: "line", style: "ashe", width: 38, speed: 470, warn: 0.85, dmg: 30, color: 0xbfeaff, length: 2600 },
  },
  {
    key: "lux", name: "Lux", ddragon: "Lux",
    color: 0xe8d24a, ring: 0xfff3a0, glow: 0xfff096,
    shot: { kind: "line", style: "lux", width: 26, speed: 820, warn: 0.58, dmg: 20, color: 0xfff3a0, length: 2400 },
  },
];

/* ---- Játszható hősök ---- */
export const CHAMPIONS: ChampionDef[] = [
  {
    key: "ezreal", name: "Ezreal", ddragon: "Ezreal", role: "Kaland-felfedező",
    color: 0xf4c542, accent: 0xffe07a,
    abilityKey: "E", abilityName: "Arcane Shift",
    abilityDesc: "Villanás a kurzor irányába, majd célkövető nyíl a legközelebbi ellenségre.",
    abilityCd: 4.5, ability: "arcaneShift",
  },
  {
    key: "vayne", name: "Vayne", ddragon: "Vayne", role: "Éjvadász",
    color: 0x8a7be0, accent: 0xb3a7ef,
    abilityKey: "Q", abilityName: "Tumble",
    abilityDesc: "Gyors gurulás a kurzor irányába — rövid cooldown, kiváló kitéréshez.",
    abilityCd: 2.4, ability: "tumble",
  },
];

/* ---- Játszható hősök listája portré-forrással ---- */
export const PLAYABLE_KEYS = CHAMPIONS.map((c) => c.key);

/* Egyedi Data Dragon azonosítók, amikhez képet töltünk (négyzet-ikon + loading art) */
export const DDRAGON_CHAMPS = Array.from(
  new Set([...ATTACKERS.map((a) => a.ddragon), ...CHAMPIONS.map((c) => c.ddragon)])
);

/* ---- Globális balansz-konstansok ---- */
export const CONFIG = {
  playerRadius: 20,
  playerSpeed: 345,
  maxHp: 100,
  flashRange: 250,
  flashCd: 5.0,
  basicCd: 0.5,
  basicSpeed: 920,
  basicRange: 760,
  enemyRadius: 26,
};
