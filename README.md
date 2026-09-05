# Aurelia Resort — WebAR demo

A mobile WebAR demo for the fictional Aurelia resort, built on the 8th Wall
engine (SLAM world tracking) with React + Three.js. Point a phone at a table,
tap to place the whole island resort, walk around it, tap hotspots (rooms,
pool, spa, dining, beach), swap GLB scene states, watch the AR film plane,
and finish at the booking / lead-capture flow.

## Development

You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

For AR testing on a phone, expose the dev server over HTTPS (ngrok or similar)
— camera + SLAM require a secure context:

```sh
ngrok http 8080
```

Then open `https://<your-tunnel>/ar/aurelia-resort` on the phone.
Append `?ar-debug=1` for the SLAM diagnostics HUD.

## Useful scripts

- `npm run dev` — local dev server (port 8080)
- `npm run build` — production build
- `npm run typecheck` / `npm run lint` — checks
- `node scripts/fetch-resort-model.mjs --url <direct .glb>` — install a model
- `npm run build:usdz -- --in <glb> --out <usdz>` — iOS Quick Look build

See `docs/reference-tech.md`, `docs/resort-model-pipeline.md` and
`docs/device-matrix.md` for architecture, model and device notes.

## Built with

- 8th Wall engine (SLAM world tracking)
- TanStack Start
- TypeScript
- React + Three.js
- Tailwind CSS
