# Test record

## Automated results (local run, 2026-10-23, after adding Layered 2D, the Radiant effects and still-mode navigation)

Environment: Node 22.22, Chromium (Playwright 1.56, SwiftShader software WebGL), Linux.

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | ✅ no errors |
| ESLint | `npm run lint` | ✅ no errors or warnings |
| Unit tests | `npm test` | ✅ 152 / 152 passed |
| Production build at `/shaderlab/` | `BASE_PATH=/shaderlab/ npm run build` | ✅ built; Workbox precache of 18 entries (~2.1 MB) |
| End-to-end smoke | `npm run test:e2e` | ✅ 26 / 26 after one fix (24 desktop, 2 mobile/Pixel 7); the crash-recovery test was made deterministic (see below) and passed 5 / 5 repeats |

Additional manual/scripted verification during development:

- Every preset and every *File → New* template compiled in headless Chromium under **both WebGL 2 and WebGL 1** (`truchet` and the GLSL ES 3.00 template correctly report that they need WebGL 2 under WebGL 1). This surfaced and fixed a real issue: GLSL ES 1.00 shaders using `fwidth` cannot get derivatives under WebGL 2, so the adapter now upgrades them to ES 3.00 token-wise.
- Screenshots reviewed for: desktop workspace, compile-error banner + console, 3×3 L1–L3 variant gallery (all 9 variants compiled), A/B compare, mutation history tree, constants promotion, modulation, keyframe timeline, export dialog, light theme, and mobile (viewport, controls drawer, code drawer).
- The Landscape Studio shader was rendered for all nine scenes under WebGL 2 and WebGL 1 and the screenshots reviewed; scene values were tuned (camera placement, night lighting and stars, dune shape, shoreline foam) from those renders.
- The Block World (voxel) shader was rendered for all nine scenes under WebGL 2 and WebGL 1 and reviewed; water tinting, beach placement and desert sand were tuned from those renders, and tree lookup was reduced to one candidate per 5×5 cell.
- Vegetation realism (2026-10-23): close-up and distant renders of the Realistic style were reviewed before/after reshaping trees (spruce tiers, multi-lobe broadleaf crowns, self-occlusion, wrapped and back-lighting, muted foliage/grass colours) and with the *Plants* switch off, in both Realistic and Blocks styles.
- Radiant effects: all 32 ported shaders were compiled and rendered offscreen under WebGL 2 and WebGL 1 (192×108, t = 6 s) and a contact sheet reviewed; one candidate (*Shattered Plains*) was dropped because its source is assembled by nested JavaScript and expects a normalised mouse. Per-frame cost under SwiftShader was 30–440 ms at that size versus ~1.2 s for the ray-marched landscape.
- Layered 2D landscape: all nine scenes rendered and reviewed; ~0.25–0.45 s per 480×270 frame under SwiftShader versus ~5–6 s for the Realistic style. Terrain profiles mirror the 3D terrain types; slope shading is taken from a smoothed ridge to avoid streaks.
- Crash-recovery test: it reloaded after a fixed 2 s wait, but the 1.2 s autosave can be delayed past that under a software GPU, and IndexedDB writes issued during `pagehide` are not guaranteed to commit — so it was intermittently red (seen in CI). It now polls the *committed* session over a raw IndexedDB connection before reloading (Dexie's in-page cache can report a write early, and `waitForFunction` does not await a returned promise).
- Found and fixed via e2e: a stale hash route re-opened the previous shader after a library click; React selector returning fresh arrays caused a render loop.

## Deployment status

Deployment to GitHub Pages is reported separately in the project hand-off; it is only considered successful once a workflow run has completed the `deploy` job and the live URL has been checked.

## Manual verification checklist (live site)

1. Open `https://<owner>.github.io/<repo>/` — the **viewer** opens on the first preset; *Editor* (or `#/edit`) opens the workstation.
2. DevTools → Application → Manifest: name *Shader Forge*, start URL and scope `/<repo>/`, icons load.
3. DevTools → Application → Service workers: activated, scope `/<repo>/`. Install the app.
4. Paste a Shadertoy shader into the editor; it compiles automatically. Add a typo: the error banner appears, the last image keeps rendering, *Revert to working* restores it.
5. Move sliders, colour pickers and the XY pad; lock a parameter and press *Randomize* — the locked value does not change.
6. *Variants* → *New seed* — the grid fills progressively; *Generate* again with the same seed reproduces it; *Compare* a variant.
7. *Save*, reload — the shader appears under *My shaders* with its thumbnail.
8. *Export* → JSON and ZIP; *Import* them back — parameters, provenance and history are intact. Export a 4K PNG and a 5 s WebM.
9. Settings → *Download full backup*; import the backup — nothing is overwritten.
10. DevTools → Network → *Offline*, reload — the app and all presets still work.
11. Viewer (`#/view`): browse with ← →, shuffle, open the parameter drawer, set a 10 s slideshow, try `?ui=off`, press *Edit*.
12. Landscape studio (`#/landscape`): pick each scene, press *New world* / *Waterscape*, change water body and time of day, while still drag to pan / scroll to zoom / right-drag to turn (Undo reverts), *Animate* and drag to look, switch *Plants* off, export a 4K PNG, *Save*, *Open in editor*; switch to *Blocks* and try chunky/fine blocks, forest, flat colours; switch to *Layered 2D* and try the *Layers* presets and wheel zoom.
13. Viewer: open the *Lightweight 2D (Radiant)* category and step through the effects; with the OS "reduce motion" setting on, the viewer starts paused.
13. On a phone: bottom bar, Library / Controls / Code drawers, sliders draggable with a thumb.
