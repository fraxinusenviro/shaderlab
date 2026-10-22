# Third-party notices

Shader Forge bundles the following third-party shader code. Each was checked for an explicit, permissive licence before inclusion. The full notices are also stored with each preset (Info tab) and exported in project ZIPs as `ATTRIBUTION.txt`.

## GL Transitions — `src/presets/shaders/glt-*.glsl`

| File | Author | Licence (file header) | Source |
| --- | --- | --- | --- |
| `glt-crosswarp.glsl` | Eke Péter | MIT | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/crosswarp.glsl |
| `glt-ripple.glsl` | gre | MIT | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/ripple.glsl |
| `glt-circleopen.glsl` | gre | MIT | https://github.com/gl-transitions/gl-transitions/blob/master/transitions/circleopen.glsl |

Bundled verbatim (a `// Source:` comment line was prepended).

```
MIT License

Copyright (c) 2017-present gl-transitions contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Radiant — `src/presets/shaders/radiant-fluid-amber.glsl`

*Fluid Amber* by Paul Bakaus, from https://github.com/pbakaus/radiant/blob/main/static/fluid-amber.html (a WebGL shader; Radiant's Canvas 2D effects were not used). Adapted: the fragment shader was extracted from the HTML page and `@param` annotations were added (ranges from Radiant's `src/lib/shaders.ts`). The `snoise` simplex-noise function follows Ashima Arts / Stefan Gustavson's webgl-noise (MIT).

```
MIT License

Copyright (c) 2025 Paul Bakaus

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Elevation data — Natural Resources Canada CanElevation (HRDEM / MRDEM)

Not bundled: fetched at runtime when the user loads elevation data in the Landscape studio. Contains information licensed under the Open Government Licence – Canada (https://open.canada.ca/en/open-government-licence-canada). Source: Natural Resources Canada, High Resolution Digital Elevation Model (HRDEM) and Medium Resolution DEM (MRDEM), CanElevation Series. Saved projects using this data carry the attribution in their description and provenance.

## npm dependencies

Runtime dependencies (React, Zustand, Dexie, JSZip, CodeMirror, Lucide, Workbox, geotiff.js) are installed from npm under their own licences (MIT, ISC, Apache-2.0; geotiff.js is MIT; JSZip is dual MIT/GPLv3 and used under MIT); see `package-lock.json` and each package's licence file.
