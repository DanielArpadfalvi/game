#!/usr/bin/env node
/* =========================================================================
   Data Dragon asset-letöltő.
   Letölti a szükséges bajnokok négyzet-ikonját és loading artját a
   public/assets/champions mappába. A valódi arcképek ezután "maguktól"
   bekötnek a játékba (a BootScene onnan tölti őket).

   Használat:
     npm run fetch-assets

   Megjegyzés: a képek a Riot Games tulajdonát képezik; nem-kommersz /
   fan projektre használhatók a Riot feltételei szerint.

   A letöltés a rendszer `curl`-jét használja, így működik a fejlesztői
   proxy mögött is (ha be van állítva HTTPS_PROXY + CA bundle), és a
   sima interneten is.
   ========================================================================= */

import { execFile } from "node:child_process";
import { mkdir, access } from "node:fs/promises";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";

const run = promisify(execFile);

const CHAMPS = ["Ezreal", "Ryze", "Ziggs", "Ashe", "Lux", "Vayne"];
const OUT = path.resolve("public/assets/champions");

const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || "";
const CA = "/root/.ccr/ca-bundle.crt";

function curlArgs(url, outFile) {
  const args = ["-sS", "-L", "--fail", "-o", outFile, url];
  if (PROXY) {
    args.unshift("-x", PROXY);
    if (existsSync(CA)) args.unshift("--cacert", CA);
  }
  return args;
}

async function curl(url, outFile) {
  await run("curl", curlArgs(url, outFile), { maxBuffer: 64 * 1024 * 1024 });
}

async function curlText(url) {
  const { stdout } = await run("curl", curlArgs(url, "-").filter((a) => a !== "-o"), { maxBuffer: 8 * 1024 * 1024 });
  return stdout;
}

async function main() {
  await mkdir(OUT, { recursive: true });

  console.log("Legfrissebb Data Dragon verzió lekérése…");
  let version = "14.1.1";
  try {
    const versions = JSON.parse(await curlText("https://ddragon.leagueoflegends.com/api/versions.json"));
    version = versions[0];
  } catch (e) {
    console.warn("Nem sikerült a verziólista (fallback: " + version + ").", e.message);
  }
  console.log("Verzió:", version);

  let ok = 0, fail = 0;
  for (const champ of CHAMPS) {
    const square = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champ}.png`;
    const loading = `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${champ}_0.jpg`;
    const jobs = [
      [square, path.join(OUT, `${champ}.png`)],
      [loading, path.join(OUT, `${champ}_load.jpg`)],
    ];
    for (const [url, out] of jobs) {
      try {
        await curl(url, out);
        console.log("  ✓", path.basename(out));
        ok++;
      } catch (e) {
        console.error("  ✗", path.basename(out), "-", e.message.split("\n")[0]);
        fail++;
      }
    }
  }
  console.log(`\nKész: ${ok} fájl letöltve, ${fail} hiba.`);
  if (fail > 0) {
    console.log("Ha a hálózat blokkolja a ddragon.leagueoflegends.com hosztot, engedélyezd a környezet");
    console.log("hálózati szabályában, vagy futtasd ezt a scriptet a saját gépeden, majd commitold az assets/ mappát.");
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
