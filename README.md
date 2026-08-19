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
| **Bal klikk** | Villám skillshot lövése a kurzor felé |
| **F** | Flash — rövid villanás a kurzor irányába (5 mp cooldown) |

## Cél

- Térj ki a feléd repülő, **előre jelzett** (piros telegraph) skillshotok elől.
- A piros sáv "megtelik" a becsapódás pillanatáig — ekkor lősz ki, ekkor kell kint lenned.
- Lődd le a pálya szélén megjelenő **varázslókat** a Villámmal (+50 pont / kilövés).
- A nehézség idővel fokozódik: több ellenség, gyorsabb és sűrűbb skillshotok.
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
