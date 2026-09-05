# Aurelia Resort — 3D model pipeline

Yes — you can download free models and use them. The rule is **license first,
polycount second, single-GLB third**.

## 1. Where to download (commercial-use safe)

| Source | License | Best for |
|---|---|---|
| [Quaternius](https://quaternius.com/) | CC0 (no attribution) | Low-poly villas, palms, furniture, food — perfect AR weight |
| [Poly Pizza](https://poly.pizza/) | CC0, filter "Commercial Use Allowed" | Stylised buildings, beach props, boats |
| [Kenney](https://kenney.nl/assets) | CC0 | Buildings, nature packs, furniture |
| [Sketchfab](https://sketchfab.com/search?q=resort&type=models&licenses=3221e871ef6c4e9baca9c91d3e5eab57) | CC0 filter (`licenses=…` = CC0) | Realistic villas, pools — check tri count |
| [AmbientCG](https://ambientcg.com/) | CC0 | Sand / water / thatch textures for reskinning |
| [Khronos samples](https://github.com/KhronosGroup/glTF-Sample-Models) | Permissive (test only) | Pipeline smoke tests, not production look |

Avoid: "Editorial", "Non-commercial", NC licenses, and Google Scanned Objects
(research-only). When in doubt, keep the source page URL in
`public/assets/models/resort.LICENSE.txt`.

## 2. What "good" looks like for WebAR

- **One `resort.glb`** containing the whole island (beach, villas, lobby,
  pool, restaurant, spa, palms, ocean disc) — like the poster, not `house.glb`.
- **< 100k triangles**, < 8 MB after compression. Phones decode this in ~1–2 s.
- **Y-up, metres**, base sitting on y = 0, footprint centred on origin.
- Draco or Meshopt geometry + KTX2 textures (the app's `ARModelLoader` already
  decodes both).
- Named nodes for hotspots (`beach-club`, `water-villas`, `main-lobby`,
  `spa`, `restaurants`, `villa-rooms`, `infinity-pool`, `private-beach`) so
  hotspot positions in `src/projects/aurelia-resort.ts` can be re-anchored to
  real node coordinates later.

## 3. Recommended recipe (fastest to the poster)

1. Download 1 Quaternius building pack + 1 nature pack (CC0 zips, each with
   individual GLBs).
2. Assemble the island in Blender: ocean disc → sand → place villas / lobby /
   pool / palms to match `ResortPlaceholder` layout (same coordinates, so
   hotspots keep working).
3. Export **one** GLB: File → Export → glTF 2.0 (`.glb`, +Y up, apply
   transforms).
4. Fetch / install it:
   ```bash
   node scripts/fetch-resort-model.mjs --url <direct .glb URL>
   # or assemble locally and copy to public/assets/models/resort.glb
   ```
5. Optimize:
   ```bash
   npx @gltf-transform/cli optimize public/assets/models/resort.glb \
     public/assets/models/resort.glb --compress draco --texture-compress ktx2
   ```
6. iOS Quick Look build (single-mesh fast path; multi-mesh islands should go
   through Blender → USDZ or Apple's Reality Converter instead):
   ```bash
   npm run build:usdz -- --in public/assets/models/resort.glb \
     --out public/assets/models/resort.usdz --size 1.2
   ```

## 4. How the app consumes it

```text
Camera
  ↓
WebXR World Tracking / SLAM (Android Chrome — replaces hosted 8th Wall)
  ↓
Hit Test → Reticle → Tap to Place
  ↓
World Anchor (model is a child of the anchor, never the camera)
  ↓
Hotspots (model-local coords × realWorldSize) move with the world
```

- No WebXR (iOS Safari) → `rel="ar"` Quick Look on `resort.usdz` (real ARKit
  anchoring, Apple viewer, no custom hotspots inside AR — by Apple design).
- No AR at all → Three.js orbit preview with the same hotspots as HTML UI.
- `resort.glb` is live: SeaSide Villa by Yogoshimo 2.0 (CC-BY, 345 KB,
  3,605 tris — see `public/assets/models/resort.LICENSE.txt`). If the file is
  ever missing, `ResortPlaceholder` renders a stand-in island so the whole
  flow (scan → place → explore → book) stays testable.

## 5. 8th Wall note (Feb 2026 change)

8th Wall's hosted platform retired **Feb 28, 2026**; the engine is now
open-source with world tracking shipped separately. This repo deliberately
uses **WebXR hit-test + anchors** (open, no monthly fee) as the primary
tracker — the same architecture, without the hosted dependency. If you later
need 8th Wall's SLAM on browsers without WebXR, add it behind
`ar/capabilities.ts` as another `ARCapability`, keeping the anchor contract
unchanged.
