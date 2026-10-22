/**
 * Bundled preset catalogue. Original shaders are MIT-licensed Shader Forge
 * works; third-party entries were checked for an explicit permissive
 * licence and carry author, source URL and licence notice.
 */
import type { ChannelBinding, Modulation, PresetDef } from '../types/shader';
import aurora from './shaders/aurora.glsl?raw';
import bands from './shaders/bands.glsl?raw';
import caustics from './shaders/caustics.glsl?raw';
import cells from './shaders/cells.glsl?raw';
import clouds from './shaders/clouds.glsl?raw';
import gltCircleOpen from './shaders/glt-circleopen.glsl?raw';
import gltCrosswarp from './shaders/glt-crosswarp.glsl?raw';
import gltRipple from './shaders/glt-ripple.glsl?raw';
import inferno from './shaders/inferno.glsl?raw';
import julia from './shaders/julia.glsl?raw';
import landscape from './shaders/landscape.glsl?raw';
import kaleido from './shaders/kaleido.glsl?raw';
import lens from './shaders/lens.glsl?raw';
import liquid from './shaders/liquid.glsl?raw';
import mandelbrot from './shaders/mandelbrot.glsl?raw';
import plasma from './shaders/plasma.glsl?raw';
import fluidAmber from './shaders/radiant-fluid-amber.glsl?raw';
import sdf from './shaders/sdf.glsl?raw';
import sparks from './shaders/sparks.glsl?raw';
import starfield from './shaders/starfield.glsl?raw';
import strata from './shaders/strata.glsl?raw';
import terrain from './shaders/terrain.glsl?raw';
import truchet from './shaders/truchet.glsl?raw';
import turbulence from './shaders/turbulence.glsl?raw';

const SF = { author: 'Shader Forge contributors', license: 'MIT' };

export const MIT_GL_TRANSITIONS = `MIT License

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
SOFTWARE.`;

export const MIT_RADIANT = MIT_GL_TRANSITIONS.replace('2017-present gl-transitions contributors', '2025 Paul Bakaus');

const transitionChannels: ChannelBinding[] = [
  { assetId: 'builtin:dusk', filter: 'linear', wrap: 'clamp' },
  { assetId: 'builtin:tiles', filter: 'linear', wrap: 'clamp' },
];
const progressSweep: Record<string, Modulation> = {
  progress: { kind: 'triangle', enabled: true, rate: 0.2, depth: 1, phase: 0 },
};

export const PRESETS: PresetDef[] = [
  { id: 'mandelbrot', name: 'Mandelbrot Explorer', category: 'Fractals', description: 'Smooth-coloured Mandelbrot set with zoom, centre and palette controls.', tags: ['fractal', 'iterative', 'escape-time'], format: 'shadertoy', fragment: mandelbrot, ...SF },
  { id: 'julia', name: 'Julia Bloom', category: 'Fractals', description: 'Julia set whose constant orbits a circle; orbit traps add glow.', tags: ['fractal', 'julia', 'animated'], format: 'shadertoy', fragment: julia, ...SF },
  { id: 'terrain', name: 'Ridge Flyover', category: 'Terrain & Landscape', theme: 'Earth', description: 'Raymarched ridged-noise mountains with snow, fog and sun.', tags: ['terrain', 'raymarch', 'earth'], format: 'shadertoy', fragment: terrain, ...SF },
  { id: 'landscape', name: 'Landscape Studio', category: 'Terrain & Landscape', theme: 'Earth', description: 'Procedural raymarched terrain and water: mountains, hills, islands, canyons, dunes; waves, foam, sky, clouds and a flyover camera. Also available as the dedicated Landscape studio.', tags: ['terrain', 'water', 'raymarch', 'landscape', 'ocean'], format: 'shadertoy', fragment: landscape, ...SF },
  { id: 'strata', name: 'Topographic Strata', category: 'Terrain & Landscape', theme: 'Earth', description: 'Contour-line map over warped noise (conventional GLSL ES 1.00 main()).', tags: ['terrain', 'contours', 'earth', 'standard'], format: 'standard', fragment: strata, ...SF },
  { id: 'turbulence', name: 'Domain Turbulence', category: 'Noise & Turbulence', description: 'Two-level domain-warped fBm with octave, lacunarity and gain controls.', tags: ['noise', 'fbm', 'warp'], format: 'shadertoy', fragment: turbulence, ...SF },
  { id: 'cells', name: 'Cellular Colony', category: 'Organic & Biological', description: 'Wobbling Voronoi cells with membranes and nuclei.', tags: ['voronoi', 'organic', 'cells'], format: 'shadertoy', fragment: cells, ...SF },
  { id: 'caustics', name: 'Ocean Caustics', category: 'Water & Fluid', theme: 'Water', description: 'Shimmering pool-floor caustics from the edges of drifting, warped Voronoi cells.', tags: ['water', 'caustics', 'light'], format: 'shadertoy', fragment: caustics, ...SF },
  { id: 'liquid', name: 'Liquid Marble', category: 'Water & Fluid', description: 'Iterative flow distortion producing marbled ink.', tags: ['fluid', 'distortion', 'marble'], format: 'shadertoy', fragment: liquid, ...SF },
  { id: 'plasma', name: 'Neon Plasma', category: 'Fire & Plasma', description: 'Classic sum-of-sines plasma written as a conventional main() shader.', tags: ['plasma', 'retro', 'standard'], format: 'standard', fragment: plasma, ...SF },
  { id: 'inferno', name: 'Inferno', category: 'Fire & Plasma', theme: 'Fire', description: 'Rising turbulent flames with core and edge colours.', tags: ['fire', 'flame', 'noise'], format: 'shadertoy', fragment: inferno, ...SF },
  { id: 'sparks', name: 'Ember Sparks', category: 'Particles', theme: 'Fire', description: 'Particle-like embers rising and swirling over a glow.', tags: ['particles', 'fire', 'glow'], format: 'shadertoy', fragment: sparks, ...SF },
  { id: 'clouds', name: 'Drifting Cumulus', category: 'Clouds & Atmosphere', theme: 'Air', description: 'Wind-blown cloud layer with self-shadowing over a sky gradient.', tags: ['clouds', 'sky', 'air'], format: 'shadertoy', fragment: clouds, ...SF },
  { id: 'aurora', name: 'Aurora Curtains', category: 'Clouds & Atmosphere', theme: 'Air', description: 'Shimmering aurora curtains over a twinkling star field.', tags: ['aurora', 'night', 'atmosphere'], format: 'shadertoy', fragment: aurora, ...SF },
  { id: 'kaleido', name: 'Kaleido Lattice', category: 'Geometry & Symmetry', theme: 'Geometry', description: 'N-fold kaleidoscope folding a lattice of rings and diagonals.', tags: ['symmetry', 'kaleidoscope', 'geometry'], format: 'shadertoy', fragment: kaleido, ...SF },
  { id: 'truchet', name: 'Truchet Weave', category: 'Geometry & Symmetry', theme: 'Geometry', description: 'Seeded Truchet tiling with flowing stripes (GLSL ES 3.00 main()).', tags: ['tiling', 'truchet', 'geometry', 'glsl3'], format: 'standard', fragment: truchet, ...SF },
  { id: 'sdf', name: 'SDF Sculpture', category: 'Ray Marching & SDF', theme: 'Geometry', description: 'Smooth-blended torus and spheres with soft shadows. Drag to orbit.', tags: ['raymarch', 'sdf', '3d'], format: 'shadertoy', fragment: sdf, ...SF },
  { id: 'starfield', name: 'Warp Starfield', category: 'Particles', description: 'Layered star particles streaking toward the viewer.', tags: ['particles', 'space', 'stars'], format: 'shadertoy', fragment: starfield, ...SF },
  { id: 'bands', name: 'Interference Bands', category: 'Abstract Generative', description: 'Two wave sources interfering under a cosine palette.', tags: ['abstract', 'waves', 'palette'], format: 'shadertoy', fragment: bands, ...SF },
  {
    id: 'lens', name: 'Lens & Prism', category: 'Image Processing & Transitions', description: 'Lens ripple, chromatic aberration and pixelation applied to iChannel0. Click to move the lens centre.',
    tags: ['image', 'post-process', 'texture'], format: 'shadertoy', fragment: lens, ...SF,
    channels: [{ assetId: 'builtin:dusk', filter: 'linear', wrap: 'clamp' }],
  },
  {
    id: 'glt-crosswarp', name: 'Crosswarp (GL Transition)', category: 'Image Processing & Transitions', description: 'The outgoing image zooms in while the incoming one zooms out into place.',
    tags: ['transition', 'gl-transitions', 'warp'], format: 'gltransition', fragment: gltCrosswarp,
    author: 'Eke Péter', license: 'MIT', sourceUrl: 'https://github.com/gl-transitions/gl-transitions/blob/master/transitions/crosswarp.glsl', notice: MIT_GL_TRANSITIONS,
    channels: transitionChannels, modulations: progressSweep,
  },
  {
    id: 'glt-ripple', name: 'Ripple (GL Transition)', category: 'Image Processing & Transitions', description: 'Ripples spread from the centre while crossfading.',
    tags: ['transition', 'gl-transitions', 'ripple'], format: 'gltransition', fragment: gltRipple,
    author: 'gre', license: 'MIT', sourceUrl: 'https://github.com/gl-transitions/gl-transitions/blob/master/transitions/ripple.glsl', notice: MIT_GL_TRANSITIONS,
    channels: transitionChannels, modulations: progressSweep,
  },
  {
    id: 'glt-circleopen', name: 'Circle Open (GL Transition)', category: 'Image Processing & Transitions', description: 'A soft-edged circle opens from the centre to reveal the incoming image.',
    tags: ['transition', 'gl-transitions', 'iris'], format: 'gltransition', fragment: gltCircleOpen,
    author: 'gre', license: 'MIT', sourceUrl: 'https://github.com/gl-transitions/gl-transitions/blob/master/transitions/circleopen.glsl', notice: MIT_GL_TRANSITIONS,
    channels: transitionChannels, modulations: progressSweep,
  },
  {
    id: 'radiant-fluid-amber', name: 'Fluid Amber (Radiant)', category: 'Noise & Turbulence', theme: 'Water', description: 'Domain-warped simplex noise with a warm amber palette. Hover to swirl.',
    tags: ['noise', 'radiant', 'organic', 'standard'], format: 'standard', fragment: fluidAmber,
    author: 'Paul Bakaus (Radiant); simplex noise after Ashima Arts / Stefan Gustavson', license: 'MIT', sourceUrl: 'https://github.com/pbakaus/radiant/blob/main/static/fluid-amber.html', notice: MIT_RADIANT,
  },
];

export const PRESET_CATEGORIES = Array.from(new Set(PRESETS.map((p) => p.category)));
export const THEMES = ['Earth', 'Air', 'Fire', 'Water', 'Geometry'] as const;

export function getPreset(id: string): PresetDef | undefined {
  return PRESETS.find((p) => p.id === id);
}
