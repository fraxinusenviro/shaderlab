# Test record

## Automated results (local run, 2026-10-22, after adding the Viewer, Landscape studio and Blocks style)

Environment: Node 22.22, Chromium (Playwright 1.56, SwiftShader software WebGL), Linux.

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | ✅ no errors |
| ESLint | `npm run lint` | ✅ no errors or warnings |
| Unit tests | `npm test` | ✅ 89 / 89 passed (7 files) |
| Production build at `/shaderlab/` | `BASE_PATH=/shaderlab/ npm run build` | ✅ built; Workbox precache of 17 entries (~1.7 MB) |
| End-to-end smoke | `npm run test:e2e` | ✅ 21 / 21 passed (19 desktop, 2 mobile/Pixel 7) |

Additional manual/scripted verification during development:

- Every preset and every *File → New* template compiled in headless Chromium under **both WebGL 2 and WebGL 1** (`truchet` and the GLSL ES 3.00 template correctly report that they need WebGL 2 under WebGL 1). This surfaced and fixed a real issue: GLSL ES 1.00 shaders using `fwidth` cannot get derivatives under WebGL 2, so the adapter now upgrades them to ES 3.00 token-wise.
- Screenshots reviewed for: desktop workspace, compile-error banner + console, 3×3 L1–L3 variant gallery (all 9 variants compiled), A/B compare, mutation history tree, constants promotion, modulation, keyframe timeline, export dialog, light theme, and mobile (viewport, controls drawer, code drawer).
- The Landscape Studio shader was rendered for all nine scenes under WebGL 2 and WebGL 1 and the screenshots reviewed; scene values were tuned (camera placement, night lighting and stars, dune shape, shoreline foam) from those renders.
- The Block World (voxel) shader was rendered for all nine scenes under WebGL 2 and WebGL 1 and reviewed; water tinting, beach placement and desert sand were tuned from those renders, and tree lookup was reduced to one candidate per 5×5 cell.
- Found and fixed via e2e: a stale hash route re-opened the previous shader after a library click; React selector returning fresh arrays caused a render loop.

## Deployment status

Deployment to GitHub Pages is reported separately in the project hand-off; it is only considered successful once a workflow run has completed the `deploy` job and the live URL has been checked.

## Manual verification checklist (live site)

1. Open `https://<owner>.github.io/<repo>/` — the Mandelbrot preset renders, FPS overlay updates.
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
12. Landscape studio (`#/landscape`): pick each scene, press *New world* / *Waterscape*, change water body and time of day, drag to look, export a 4K PNG, *Save*, *Open in editor*; switch to *Blocks* and try chunky/fine blocks, forest, flat colours.
13. On a phone: bottom bar, Library / Controls / Code drawers, sliders draggable with a thumb.
