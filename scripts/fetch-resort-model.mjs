#!/usr/bin/env node
/**
 * Fetch a free CC0 resort / villa / island GLB from the internet and install it
 * as the Aurelia Resort model.
 *
 * Why this exists: modelling a full resort in Blender takes weeks. Starting
 * from a CC0 base (Quaternius, Poly Pizza, Kenney, Sketchfab CC0) is the
 * fastest legal route — then you reskin / extend it into the Aurelia layout.
 *
 * Usage:
 *   node scripts/fetch-resort-model.mjs --url <direct .glb/.gltf URL> [--out resort.glb]
 *   node scripts/fetch-resort-model.mjs --demo
 *
 * --demo downloads a small CC0 test asset so you can verify the pipeline
 * end-to-end before picking the real resort base. It is NOT the resort look.
 *
 * After fetching:
 *   1. npx @gltf-transform/cli optimize public/assets/models/resort.glb \
 *        public/assets/models/resort.glb --compress draco --texture-compress ktx2
 *   2. npm run build:usdz -- --in public/assets/models/resort.glb \
 *        --out public/assets/models/resort.usdz --size 1.2
 *   3. Open /ar/aurelia-resort and tap to place.
 *
 * Licensing: only use assets marked CC0 / CC-BY with commercial use allowed.
 * Keep the source URL + author in ASSET_LICENSE below — the script writes it to
 * public/assets/models/resort.LICENSE.txt automatically.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

// A tiny Khronos sample used only to smoke-test the download → load →
// optimize → usdz chain. Replace with your resort base for production.
const DEMO_URL =
  "https://github.com/KhronosGroup/glTF-Sample-Models/raw/main/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outName = flag("out", "resort.glb");
const outPath = resolve(root, "public/assets/models", outName);
const url = args.includes("--demo") ? DEMO_URL : flag("url", "");

if (!url) {
  console.error(
    [
      "fetch-resort-model: pass a direct .glb URL or --demo.",
      "",
      "  node scripts/fetch-resort-model.mjs --demo",
      "  node scripts/fetch-resort-model.mjs --url https://example.com/villa.glb",
      "",
      "Curated CC0 sources (see docs/resort-model-pipeline.md):",
      "  - Quaternius.com  (CC0 low-poly buildings, palms, furniture)",
      "  - Poly.pizza      (CC0, filter by Commercial Use Allowed)",
      "  - Kenney.nl       (CC0 game-ready packs)",
      "  - Sketchfab → Downloadable → CC0 license filter",
    ].join("\n"),
  );
  process.exit(1);
}

const res = await fetch(url);
if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText} for ${url}`);
const bytes = Buffer.from(await res.arrayBuffer());
if (bytes.readUInt32LE(0) !== 0x46546c67) {
  throw new Error("downloaded file is not a GLB (bad magic) — pass a direct .glb link");
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, bytes);
writeFileSync(
  outPath.replace(/\.glb$/, ".LICENSE.txt"),
  [
    `Aurelia Resort base model`,
    `Source: ${url}`,
    `Downloaded: ${new Date().toISOString()}`,
    `License: verify CC0 / CC-BY commercial use on the source page before shipping.`,
    `If CC-BY, add author + link here and in the app credits.`,
  ].join("\n"),
);

console.log(
  [
    `saved ${(bytes.length / 1024).toFixed(0)} KB → ${outPath.replace(`${root}/`, "")}`,
    `next: optimize, then build USDZ for iOS Quick Look:`,
    `  npx @gltf-transform/cli optimize public/assets/models/${outName} public/assets/models/${outName} --compress draco --texture-compress ktx2`,
    `  npm run build:usdz -- --in public/assets/models/${outName} --out public/assets/models/resort.usdz --size 1.2`,
  ].join("\n"),
);
