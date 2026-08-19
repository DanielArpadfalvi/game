# Rift Dodge — Skillshot Aréna (prototípus)

Böngészőből játszható, **League of Legends-inspirált** skillshot-kitérős mini-aréna.
Egyjátékos, nulla backend — minden HTML5 Canvasen fut.

> ⚠️ Ez egy **eredeti, LoL-inspirált** projekt. Nem tartalmaz Riot Games tulajdonú
> nevet, grafikát vagy védjegyet. A "LoL-érzet" a játékmenetből jön (egérrel irányítás,
> skillshotok, telegraph-ok), nem hivatalos assetekből.

## Irányítás (mint az igazi LoL-ban)

| Bemenet | Hatás |
|---------|-------|
| **Jobb klikk** | A bajnok odasétál a kattintott pontra |
| **Bal klikk** | Alaptámadás a kurzor felé (ellenség kilövése +50 pont) |
| **Hős-skill** | Ezreal: **E** (Arcane Shift) · Vayne: **Q** (Tumble) |
| **F** | Flash — rövid villanás a kurzor irányába (5 mp cooldown) |

## Játszható hősök

- **Ezreal — Arcane Shift (E):** villanás a kurzor irányába, majd célkövető nyíl a legközelebbi ellenségre.
- **Vayne — Tumble (Q):** gyors gurulás a kurzor irányába, rövid cooldownnal — kiváló kitéréshez.

Mindkét képesség rövid sebezhetetlenséget ad a mozdulat ideje alatt.

## Ellenséges bajnokok (jellegzetes skillshotok)

| Bajnok | Skillshot | Stílus |
|--------|-----------|--------|
| **Ezreal** | Mystic Shot | gyors, vékony arany lövedék |
| **Ryze** | Overload | lila-kék rúna-lövés, közepes |
| **Ziggs** | Bouncing Bomb | pattogó bomba → narancs AoE robbanás |
| **Ashe** | Enchanted Crystal Arrow | lassú, nagy jeges nyíl |
| **Lux** | Light Binding | ragyogó arany-fehér fénygömb-pár |

## Pálya

**Howling Abyss** (ARAM) ihlette téli híd: fagyott kőkorlátok, rúna-embléma,
folyamatosan hulló hó, a szakadék (abyss) a pálya két hosszú éle mentén.

## Cél

- Térj ki a feléd repülő, **előre jelzett** (telegraph) skillshotok elől — a jelzés
  a becsapódás színében villan, és "megtelik" az indulás pillanatáig.
- Lődd le az ellenséges bajnokokat pontokért.
- A nehézség idővel fokozódik: több bajnok, gyorsabb és sűrűbb skillshotok.
- Pontszám = túlélési idő + kilövések. A legjobb eredmény `localStorage`-ba mentődik.

## Futtatás

Nincs build-lépés. Egy statikus fájlkiszolgáló elég:

```bash
# a repo gyökeréből
python3 -m http.server 8000
# majd böngészőben: http://localhost:8000
```

Vagy nyisd meg közvetlenül az `index.html`-t (a `file://` is működik, mert nincs fetch).

## Fájlstruktúra

```
index.html      # váz + HUD + kezdő/vég képernyők
css/style.css   # megjelenés (LoL-hangulatú arany/türkiz téma)
js/game.js      # teljes játékmotor (loop, entitások, input, render)
```

## Következő lépések (tervezett)

- **Napi kihívás + streak**: fix seed naponta → visszatérés-motor.
- **Ranglista** (barátokkal, szobakóddal) — kis backend.
- **Ultimate + több képesség**, több skillshot-típus (görbülő, csapdázó).
- **Bajnok-választás** eltérő statokkal/skillekkel.
- Mobil/touch-vezérlés.
