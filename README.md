# Shader Forge — WebGL Shader Studio & Mutation Laboratory

Shader Forge is an installable, offline-capable Progressive Web App for authoring, importing, rendering, editing, **mutating**, comparing, managing and exporting WebGL shaders. It runs entirely in the browser — there is no backend — and is deployed to GitHub Pages by GitHub Actions.

**Workflow:** Select / Import → Render → Tweak → Mutate → Compare → Save → Export

Three ways in:

| Mode | URL | For |
| --- | --- | --- |
| **Editor** | `#/` · `#/shader/<id>` | The full workstation: library, code, controls, mutation lab, history, export. |
| **Viewer** | `#/view` · `#/view/<id>` | Simply watching shaders full-screen — browse, play/pause, shuffle, slideshow, snapshot. |
| **Landscape & Waterscape studio** | `#/landscape` | Generating procedural terrain and water scenes with purpose-built controls. |

Choose which one opens at launch in *Settings → Start page*; installed PWAs also get *Viewer* and *Landscape studio* app shortcuts.

- Production URL (once Pages is enabled): `https://fraxinusenviro.github.io/shaderlab/`

---

## Features

| Area | What works |
| --- | --- |
| **Rendering** | WebGL 2 with WebGL 1 fallback; play / pause / restart / frame-step; speed (−1× … 4×); resolution scale and max-pixel cap; frame-rate cap; stop-rendering safeguard; auto-pause on sustained very slow frames; fullscreen; framing presets (fill, 16:9, 4:3, 1:1, 9:16); CSS zoom/pan for inspection (Alt + wheel / Alt + drag); FPS / frame-time / resolution overlay; Shadertoy-style mouse & touch; four texture channels; context-loss recovery (stops after repeated losses). |
| **Formats** | Shadertoy `mainImage(out vec4, in vec2)`; conventional `main()` in GLSL ES 1.00 or 3.00; GL Transitions `transition(vec2)`; auto-detection or manual selection. Uniform aliases `iTime/time/u_time`, `iResolution/resolution/u_resolution/u_res`, `iMouse`, `u_mouse` (pixels), `mouse` (normalised), `iFrame`, `iDate`, `iChannel0–3`, `iChannelResolution`, … are supplied automatically. |
| **Editor** | CodeMirror 6 with GLSL highlighting, completion, search, bracket matching; inline diagnostics; compile-as-you-type (debounced) or Ctrl+Enter; separate optional vertex shader. |
| **Diagnostics** | Errors mapped to *your* line numbers; errors in the generated compatibility wrapper, vertex stage, linker or format adapter are labelled as such; the last successful program keeps rendering; one-click **Revert to working** and **Original**. Imported/original source is never overwritten. |
| **Control surface** | Auto-generated controls for every `float/int/bool/vec2/vec3/vec4` uniform: sliders + numeric fields, toggles, dropdowns, colour pickers, vector sliders, XY pads, angle dials, seed fields; per-parameter reset, randomise, lock, modulate; editable min / max / step / default / label / group; compact and expanded modes; colour-coded semantic groups. |
| **Constants → parameters** | The *Constants* tab lists float literals that are safe to expose (loop bounds, array sizes, `const` and global initialisers, preprocessor values and integers are excluded; 0/1 and constructor components are flagged "caution"). **Promote** replaces the literal with an annotated uniform; **Restore literal** reverses it exactly; **Bake value** writes the current value back as a literal. |
| **Mutation lab** | Level 1 (uniform values), Level 2 (token-level maths: constants, trig frequency, sin↔cos, floor↔ceil/min↔max, time scale / reverse), Level 3 (structural: symmetry/kaleidoscope, tiling, wave/swirl warps, polar remap, rotate/zoom, function substitution, colour post-process, mirrored self-blend). Global strength, probability, seed, count, parameter groups, scope, locks. Deterministic: same seed ⇒ same variants. Every mutated source is compile-validated; invalid variants are marked and never replace the working shader. |
| **History** | Undo/redo (200 steps, coalesced while dragging); mutation tree with parent→child links, seeds, operations, named snapshots, favourites, restore, save-as-new-shader; saved revisions. |
| **Variant gallery** | 2×2 / 3×3 / 4×4 grids with thumbnails rendered one-at-a-time on a shared offscreen context; seed, strength, level and change summary; open, save, compare, regenerate, delete, favourite; synchronised preview time. |
| **A/B compare** | Two live canvases (current vs. variant / history node / original) with synchronised or independent clocks. |
| **Modulation** | Per-parameter sine / triangle / saw / square LFOs, random steps, smooth noise, keyframes (timeline with looping), safe arithmetic expressions (no `eval`), and links to other parameters with depth. |
| **Library** | IndexedDB (Dexie) storage; bundled presets clearly separated and read-only; search, categories, Earth/Air/Fire/Water/Geometry themes, favourites, folders, collections, rename, duplicate, delete; thumbnails; autosave and crash recovery of the working copy. |
| **Import / export** | Import `.glsl .frag .fs .vert .vs .txt` (a `.frag`+`.vert` pair with the same name is combined), project `.json`, project `.zip`, full-library backup `.zip`; paste into the editor; drag-and-drop. Export GLSL, project JSON, project ZIP (with assets, thumbnail, original source, attribution), parameter/mutation metadata, PNG at arbitrary resolution (rendered offscreen), and WebM (or MP4 where the browser supports it) via `MediaRecorder`. |
| **PWA** | Installable; app shell and bundled presets precached by Workbox; works offline after the first visit; update prompt that never touches user data. |
| **Viewer** | Full-screen canvas with auto-hiding controls: shader picker (presets + My shaders), previous/next, play/pause/restart, shuffle parameters, optional parameter drawer, slideshow (10–60 s), info card with author/licence, PNG snapshot, fullscreen, and *Edit* to open the shader (with any tweaks) in the editor. Keyboard: ← → Space R I F. Kiosk/embedding: `#/view/<id>?slideshow=20&ui=off`. |
| **Landscape & Waterscape studio** | Built on the original *Landscape Studio* raymarched shader: five terrain types (mountains, rolling hills, archipelago, canyons, dunes), world seed, relief, roughness, octaves, snow line, vegetation; water level, waves, clarity, shoreline foam and colours; sun elevation/direction with night sky and stars, clouds, haze; flyover camera (altitude, pitch, heading, speed, lens, drag-to-look) and Draft/Balanced/High quality. Nine scene presets with thumbnails (alpine lake, tropical archipelago, desert canyon, dune sea, stormy coast, fjord at dusk, rolling hills, open ocean, moonlit tarn); *New world*, *Landscape*, *Waterscape* and *Vary* generators; one-click water bodies, times of day and camera shots; undo; settings persist per browser; PNG export up to 4K; *Save* to My shaders; *Open in editor* for code, mutation and video export. Works on WebGL 1 and 2. **Render style: Realistic or Blocks** — *Blocks* rebuilds the same world (same generator, seed, water, sun and camera) out of cubes with a 3D DDA voxel tracer: original procedural pixel-art textures (grass, dirt, stone, sand, gravel, snow, banded terracotta, wood, leaves), seeded trees, translucent water, a square sun and moon, blocky clouds and a *Blocks* tab (block size, tree density, pixel-texture strength, edge shading, plus chunky/fine, forest, flat-colour presets). |
| **UI** | Dark (default) and light themes; resizable/collapsible panels; mobile layout with full-screen viewport, slide-out library/controls/code drawers, a bottom action bar and enlarged touch targets; keyboard shortcuts. |

---

## Quick start

```bash
npm ci
npm run dev          # http://localhost:5173/
npm run typecheck && npm run lint && npm test
npm run build        # production build into dist/
```

To reproduce the GitHub Pages layout locally:

```bash
BASE_PATH=/shaderlab/ npm run build
BASE_PATH=/shaderlab/ npm run preview   # http://localhost:4173/shaderlab/
npm run test:e2e                        # builds must use the same BASE_PATH (default /shaderlab/)
```

Playwright's Chromium is required for `test:e2e` (`npx playwright install chromium`, or set `PW_CHROMIUM_PATH` to an existing Chromium binary).

---

## Deploying to GitHub Pages

Deployment is fully automated by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) using the official Pages artifact flow (`actions/configure-pages` → `actions/upload-pages-artifact` → `actions/deploy-pages`). No `gh-pages` branch is used.

1. **Create or choose a repository** (this one is `fraxinusenviro/shaderlab`) and push this code to it.
2. In the repository, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. (This is a one-time, repository-admin setting; the workflow cannot enable it with the default token.)
3. **Push to `main`.** Every push to `main` runs type-checking, ESLint, unit tests, the production build, Playwright smoke tests against that exact build at the Pages base path, and then deploys. Pull requests run the same checks without deploying. You can also run it manually from the **Actions** tab (*Run workflow*, via `workflow_dispatch`).
4. **Check the Actions tab.** The *Build, test & deploy to GitHub Pages* run must show both the `build` and `deploy` jobs green. The `github-pages` environment shows the published URL.
5. **Open the published app** at `https://<owner>.github.io/<repository>/` — for this repository `https://fraxinusenviro.github.io/shaderlab/`.
6. **Verify the PWA:** in Chrome/Edge DevTools → *Application*, the manifest should show *Shader Forge* with start URL and scope `/<repository>/`, and the service worker should be *activated* with that scope. Use the browser's *Install* button. Then tick *Offline* in DevTools (or enable airplane mode) and reload — the app, editor and all bundled presets keep working.

### Base path and custom domains

The base path is centralised in `vite.config.ts` and read by the app through `import.meta.env.BASE_URL`; the manifest uses relative `start_url`/`scope` (`./`). The workflow passes the base path reported by `actions/configure-pages`, so:

- project sites build with `BASE_PATH=/<repository>/`;
- a custom domain (configured in *Settings → Pages*) reports an empty base path, and the app builds for `/` automatically.

You can override it with the `BASE_PATH` environment variable for any other host. Routing uses the URL hash (`#/shader/<id>`, `#/gallery`, `#/compare`), so no server rewrites are needed.

---

## Architecture

```
src/
  types/        Data model (ShaderProject, ParamDef, MutationNode, …) — serialisable, versioned
  glsl/         Lossless tokenizer, function finder; format adapter (wrappers, line mapping, ES1→ES3 upgrade, log parsing)
  renderer/     ShaderRenderer (WebGL engine, uniforms, channels, limits, context loss), Clock,
                shared offscreen renderer + scheduled thumbnail queue, built-in procedural textures
  params/       Uniform discovery + @param annotations; constant discovery and reversible promotion
  mutations/    Seeded RNG, semantic categories, Level 1/2/3 mutators, deterministic variant generation
  modulation/   Oscillators, keyframes, links; safe expression compiler (AST, whitelist, no eval)
  presets/      Bundled GLSL (shaders/*.glsl), catalogue with licence metadata, File→New templates
  viewer/       Simple full-screen Viewer page
  landscape/    Landscape & Waterscape studio: scene presets, world generators, persisted store, page
  storage/      Dexie schema, ProjectRepository interface + LocalRepository, validation, JSON/ZIP import-export
  state/        Zustand stores: workspace (project, compile, undo, history, autosave), library, lab, ui, settings
  editor/       CodeMirror 6 GLSL editor with diagnostics
  workspace/    Panels and views: TopBar, LibraryPanel, Viewport, ControlPanel, BottomDock, Gallery, Compare, dialogs
  components/   Shared UI (ParamControl widgets, LiveCanvas, modal, toasts, resizers, tabs)
  hooks/        Hash routing, media queries
e2e/            Playwright smoke tests (desktop + mobile)
```

Design notes:

- **Renderer and mutation engine are independent of React.** `renderer/` and `mutations/` import nothing from the UI; the renderer pulls modulated values through a callback each frame, so parameter changes never re-render React per frame.
- **Non-destructive by construction.** `project.original` is written once at creation/import. The adapter wraps a *copy* of user source. Mutations return new sources; the working copy changes only after successful validation, and every change is an undo step and/or a history node.
- **Scheduled GPU work.** Thumbnails and validation share one offscreen GL context and run one job per idle callback, so a 4×4 grid never spins up sixteen render loops.
- **Extensible persistence.** UI code talks to the `ProjectRepository` interface (`storage/repository.ts`); a remote-sync implementation can wrap or replace `LocalRepository` later without touching components. Dexie migrations only add stores/indexes; user data is never dropped during upgrades.

### Shader annotations

```glsl
uniform float uFreq;   // @param min=0 max=20 step=0.1 default=5 label="Frequency" group=Shape
// @param widget=color default=1,0.5,0.25
uniform vec3 uTint;
uniform int uMode;     // @param options="Circles:0,Squares:1"
uniform float uSeed;   // @param widget=seed
uniform float amount;  // = 0.5        (GL Transitions default syntax is understood)
```

Keys: `min max step default label group widget (slider|number|toggle|select|color|vector|xy|angle|seed) options description`. Without annotations, ranges and widgets are inferred from the uniform name and type.

---

## Security model

- Imported files are treated as untrusted **data**. Only GLSL text is ever compiled, and only through `gl.shaderSource/compileShader`. No JavaScript from imported files is evaluated; there is no `eval`/`new Function` anywhere (enforced by ESLint rules `no-eval`, `no-new-func`, `no-implied-eval`).
- Project JSON/ZIP is parsed with `JSON.parse`, then validated and normalised field-by-field (unknown fields dropped, sizes capped, source URLs restricted to http(s), binary text rejected). Archive assets are limited to images.
- Modulation expressions are parsed into an AST and evaluated against a fixed whitelist of maths functions and variables.
- GPU safeguards: drawing-buffer pixel cap, resolution scale, optional fps cap, a stop button, auto-pause on sustained >400 ms frames, and no automatic recompilation after repeated context loss.

---

## Bundled presets and licensing

25 presets cover fractals, terrain, noise, organic, water, fire/plasma, clouds/atmosphere, geometry/symmetry, ray marching/SDF, particles, abstract art and image processing/transitions, with Earth, Air, Fire, Water and Geometry themes.

- **21 are original Shader Forge works (MIT)**, including the *Landscape Studio* and *Block World* shaders behind the landscape studio's two render styles.
- **3 GL Transitions** (*crosswarp* by Eke Péter, *ripple* and *circleopen* by gre) — MIT, verified from each file header and the repository LICENSE; bundled verbatim with a source-URL comment.
- **1 Radiant shader** (*Fluid Amber* by Paul Bakaus) — MIT (repository LICENSE); a WebGL (not Canvas 2D) shader extracted from its HTML page with `@param` annotations added. Its simplex noise follows Ashima Arts / Stefan Gustavson's MIT webgl-noise.

Author, licence, source URL and full licence notice are stored in each preset's provenance, shown in the *Info* tab, and written to `ATTRIBUTION.txt` in project ZIP exports. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Sources investigated but **not** bundled:

- **Shadertoy** — used as a compatibility target and inspiration only; Shadertoy content defaults to CC BY-NC-SA and per-shader terms vary, so no Shadertoy code is redistributed. Paste your own or permissively licensed Shadertoy code and it runs.
- **The Library of Shaders** — describes itself as "copyright and license free", but no licence file or formal licence grant could be verified, so nothing was bundled.
- **Radiant Canvas 2D effects** — excluded (not WebGL shaders); only one `technique: 'webgl'` shader was used.

---

## Testing

| Suite | Command | Scope |
| --- | --- | --- |
| Unit (Vitest) | `npm test` | Landscape parameters, scene validity and ranges, reproducible world generation; viewer/landscape routes; tokenizer losslessness; format detection; wrapper generation and line mapping; WebGL1/2 version handling; ES1→ES3 upgrade; log parsing (user vs wrapper); annotation parsing and inference; param merge; constant discovery exclusions; promote/demote exact round-trip; L1/L2/L3 determinism, locks, categories, scope, loop-header safety; variant reproducibility; expression whitelist; oscillators; keyframes; links; preset licence metadata; IndexedDB repository (fake-indexeddb); JSON / project-ZIP / library-backup round-trips; frag+vert pairing; input validation. |
| E2E (Playwright, Chromium/SwiftShader) | `npm run test:e2e` | Production build served under `/shaderlab/`: viewer (browse, picker, parameter drawer, shuffle, kiosk mode, Edit → editor, start-page setting); landscape studio (scenes, grouped controls, water presets, terrain type, New world, persistence, Save to library, Open in editor; mobile tabs); manifest and icons resolve; service worker scope; all presets compile; presets render non-black; paste & compile; compile error keeps the last image and maps to the right line; revert; slider changes pixels; fixed-seed variants identical; 3×3 gallery renders; invalid mutation never replaces the shader; mutate + undo; save → reload persistence; session recovery after an interrupted session; export JSON → import preserves params, provenance and history; raw `.frag` import unchanged; offline reload after first visit; mobile layout (bottom bar, drawers, ≥30 px slider touch targets). |

See [`TESTING.md`](TESTING.md) for the latest recorded results and manual verification checklist.

---

## Known limitations & not-yet-implemented features

- **Multi-pass buffers / feedback (Shadertoy Buffer A–D)** are not implemented; single-pass shaders only. `iChannel` inputs are images (built-in or uploaded), not other passes, video, audio, cubemaps or keyboard.
- **Audio-reactive modulation** (Web Audio / microphone) is not implemented.
- **GIF export** is not offered (would require bundling an encoder); MP4 appears only where `MediaRecorder` supports it.
- **Remote sync** is not implemented; data lives in one browser's IndexedDB. Download backups regularly (Settings → *Download full backup*).
- **Panel docking** is limited to resizing and collapsing; panels cannot be rearranged.
- **Level 2/3 mutations** are token-based, not a full GLSL AST; they are compile-validated, but may produce valid-yet-uninteresting results. Self-blend is available for Shadertoy and GL Transition formats only; coordinate transforms on `main()` shaders need a resolution uniform.
- **Blocks style**: trees assume their neighbours' ground height (they can float or sink by a block on slopes); one tree at most per 5×5 blocks; there is no block placing/breaking or player movement — it is a viewer, not a game. Shadows are traced only at *High* quality.
- **Landscape studio**: water reflects the sky only (not the terrain), and the camera follows the ground with a simple look-ahead, so very fast flights over steep peaks can graze terrain. It is a heavy raymarcher: use *Draft* quality or a lower preview resolution on weak GPUs.
- **Expressions/keyframes** apply to scalar parameters (vectors are modulated component-wise by oscillators only).
- **WebGL 1**: GLSL ES 3.00 shaders (e.g. the *Truchet Weave* preset) cannot run and show an explanation instead.
- The **viewport zoom/pan** is a visual inspection zoom of the rendered image, not a change to shader coordinates.

## License

MIT for Shader Forge itself (see [`LICENSE`](LICENSE)). Bundled third-party shaders retain their own MIT notices (see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)).
