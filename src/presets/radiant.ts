/**
 * Lightweight flat 2D effects from Radiant by Paul Bakaus (MIT License,
 * https://github.com/pbakaus/radiant). Each is a single full-screen fragment
 * shader — a few dozen operations per pixel, no ray marching — so they are
 * cheap to run. Sources were extracted unchanged from Radiant's static HTML
 * pages with @param annotations added (ranges from Radiant's src/lib/shaders.ts).
 */
const sources = import.meta.glob("./shaders/radiant/*.glsl", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface RadiantEffect {
  id: string;
  title: string;
  description: string;
  tags: string[];
}

export const RADIANT_EFFECTS: RadiantEffect[] = [
  {
    id: "aurora-veil",
    title: "Aurora Veil",
    description:
      "Northern lights ribbons flowing above hexagonal ice crystal formations.",
    tags: ["fill", "noise", "organic"],
  },
  {
    id: "bass-ripple",
    title: "Bass Ripple",
    description:
      "Vibrating speaker mesh with beat-synced wave displacement and metallic specular sheen.",
    tags: ["fill", "physics"],
  },
  {
    id: "bioluminescence",
    title: "Bioluminescence",
    description:
      "Deep sea jellyfish pulsing with bioluminescent glow and drifting plankton.",
    tags: ["fill", "organic", "particles"],
  },
  {
    id: "burning-film",
    title: "Burning Film",
    description:
      "Celluloid film stock catching fire with spreading amber burn holes, glowing edges, and ember field.",
    tags: ["fill", "noise"],
  },
  {
    id: "chladni-resonance",
    title: "Chladni Resonance",
    description:
      "Sand patterns forming on a vibrating plate, morphing between harmonic modes with golden glow.",
    tags: ["object", "geometric", "physics"],
  },
  {
    id: "diamond-caustics",
    title: "Diamond Caustics",
    description:
      "Light refracting through rotating diamond facets casting prismatic caustic patterns.",
    tags: ["fill", "geometric"],
  },
  {
    id: "dither-gradient",
    title: "Dither Gradient",
    description:
      "Smooth gradients decomposed into shifting ordered dithering patterns with chromatic separation and bit-depth waves.",
    tags: ["fill", "geometric"],
  },
  {
    id: "eclipse-glow",
    title: "Eclipse Glow",
    description:
      "Solar eclipse corona with radial noise rays, diamond ring effect, and streaming solar wind.",
    tags: ["object", "noise"],
  },
  {
    id: "gilded-fracture",
    title: "Gilded Fracture",
    description:
      "Kintsugi-inspired golden cracks spreading across dark surface with molten gold light bleeding through.",
    tags: ["fill", "noise", "organic"],
  },
  {
    id: "golden-throne",
    title: "Golden Throne",
    description:
      "Sacred geometry mandala with golden ratio spirals and counter-rotating layers.",
    tags: ["object", "geometric"],
  },
  {
    id: "hologram-glitch",
    title: "Hologram Glitch",
    description:
      "Abstract holographic texture with chromatic aberration, scanlines, and controlled glitch bursts.",
    tags: ["fill", "noise"],
  },
  {
    id: "kaleidoscope-runway",
    title: "Kaleidoscope Runway",
    description:
      "Fashion-inspired kaleidoscopic tessellations with symmetric mirror segments.",
    tags: ["fill", "geometric"],
  },
  {
    id: "lens-whisper",
    title: "Lens Whisper",
    description:
      "Anamorphic lens flares with chromatic color separation, horizontal streaks, bokeh halos, and cinematic film grain on pure black.",
    tags: ["fill", "noise"],
  },
  {
    id: "liquid-gold",
    title: "Liquid Gold",
    description:
      "Molten metal flow with surface tension, metallic PBR shading, and golden reflections.",
    tags: ["fill", "noise", "organic"],
  },
  {
    id: "magnetic-field",
    title: "Magnetic Field",
    description:
      "Dipole field lines curving between slowly rotating poles with silk-thread glow rendering.",
    tags: ["fill", "geometric", "physics"],
  },
  {
    id: "metamorphosis",
    title: "Metamorphosis",
    description:
      "Raymarched metaballs continuously merging and splitting with liquid-metal surface.",
    tags: ["object", "organic"],
  },
  {
    id: "moire-interference",
    title: "Moiré Interference",
    description:
      "Overlapping concentric ring patterns creating hypnotic emergent moiré interference in blue-violet and teal.",
    tags: ["fill", "geometric"],
  },
  {
    id: "neon-drip",
    title: "Neon Drip",
    description:
      "Metaball blobs dripping upward with surface tension physics and trailing tendrils.",
    tags: ["fill", "organic"],
  },
  {
    id: "painted-strata",
    title: "Painted Strata",
    description:
      "Flowing layered bands with washi paper textures, slow tectonic folding, and fibrous grain — like a handcrafted landscape scroll.",
    tags: ["fill", "noise", "organic"],
  },
  {
    id: "polaroid-burn",
    title: "Polaroid Burn",
    description:
      "Scattered polaroid photos developing warm abstract memories, overexposing, and burning out with ember edges.",
    tags: ["fill", "noise"],
  },
  {
    id: "scream-wave",
    title: "Scream Wave",
    description:
      "Glowing waveform building from gentle sine to distorted scream with chromatic aberration and collapse.",
    tags: ["object", "physics"],
  },
  {
    id: "shifting-veils",
    title: "Shifting Veils",
    description:
      "Layered translucent noise curtains that morph and reveal patterns underneath.",
    tags: ["fill", "noise", "organic"],
  },
  {
    id: "signal-decay",
    title: "Signal Decay",
    description:
      "Clean amber waveforms progressively degrading into gorgeous warm noise — order dissolving into beautiful chaos.",
    tags: ["fill", "geometric"],
  },
  {
    id: "silk-cascade",
    title: "Silk Cascade",
    description:
      "Flowing layered silk fabric with anisotropic specular highlights, parallax depth, and warm translucent overlap.",
    tags: ["fill", "organic", "noise"],
  },
  {
    id: "stardust-veil",
    title: "Stardust Veil",
    description:
      "Dense cosmic stardust with parallax depth layers, aurora ribbons, constellation threads, and brightness waves.",
    tags: ["fill", "particles", "noise"],
  },
  {
    id: "strobe-geometry",
    title: "Strobe Geometry",
    description:
      "Sharp neon geometric shapes flashing in choreographed sequence with cyan-to-magenta afterglow decay.",
    tags: ["fill", "geometric"],
  },
  {
    id: "sugar-glass",
    title: "Sugar Glass",
    description:
      "Caramelized sugar glass with Voronoi fracture patterns and golden light bleeding through cracks.",
    tags: ["fill", "geometric"],
  },
  {
    id: "torn-paper",
    title: "Torn Paper",
    description:
      "Paper surface tearing apart with fibrous edges revealing warm volumetric light underneath, then reforming.",
    tags: ["fill", "noise", "organic"],
  },
  {
    id: "tropical-heat",
    title: "Tropical Heat",
    description:
      "Heat shimmer distortion with chromatic aberration and tropical color blooms.",
    tags: ["fill", "noise"],
  },
  {
    id: "vertigo",
    title: "Vertigo",
    description:
      "Slow hypnotic tunnel with crimson ring segments, wave-based illumination, and dark void center.",
    tags: ["fill", "geometric"],
  },
  {
    id: "voltage-arc",
    title: "Voltage Arc",
    description:
      "Electric plasma arcs crackling between floating conductor points with warm glow.",
    tags: ["object", "physics"],
  },
  {
    id: "vortex",
    title: "Vortex",
    description:
      "Logarithmic spiral arms converging on a drifting center with silk-thread glow and undulating perturbation.",
    tags: ["fill", "geometric"],
  },
];

export const radiantSource = (id: string): string =>
  sources[`./shaders/radiant/${id}.glsl`];
