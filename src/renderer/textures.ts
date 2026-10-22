/**
 * Built-in procedural textures available to iChannel0–3 without any
 * external assets (so they work offline and carry no licensing questions).
 */
export const BUILTIN_TEXTURES: { id: string; label: string }[] = [
  { id: 'builtin:noise', label: 'RGBA noise (256²)' },
  { id: 'builtin:checker', label: 'Checkerboard' },
  { id: 'builtin:gradient', label: 'Spectrum gradient' },
  { id: 'builtin:dusk', label: 'Dusk landscape' },
  { id: 'builtin:tiles', label: 'Coloured tiles' },
];

const cache = new Map<string, HTMLCanvasElement>();

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function builtinTexture(id: string): HTMLCanvasElement | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  switch (id) {
    case 'builtin:noise': {
      c.width = c.height = 256;
      const img = ctx.createImageData(256, 256);
      const r = seeded(1337);
      for (let i = 0; i < img.data.length; i++) img.data[i] = (r() * 256) | 0;
      for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
      ctx.putImageData(img, 0, 0);
      break;
    }
    case 'builtin:checker': {
      c.width = c.height = 256;
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          ctx.fillStyle = (x + y) % 2 ? '#e8e8e8' : '#262626';
          ctx.fillRect(x * 32, y * 32, 32, 32);
        }
      break;
    }
    case 'builtin:gradient': {
      c.width = 512;
      c.height = 256;
      const g = ctx.createLinearGradient(0, 0, 512, 0);
      ['#ff004c', '#ff9900', '#ffee00', '#33dd55', '#00aaff', '#7a33ff', '#ff004c'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 256);
      const v = ctx.createLinearGradient(0, 0, 0, 256);
      v.addColorStop(0, 'rgba(255,255,255,0.6)');
      v.addColorStop(0.5, 'rgba(255,255,255,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, 512, 256);
      break;
    }
    case 'builtin:dusk': {
      c.width = 512;
      c.height = 512;
      const sky = ctx.createLinearGradient(0, 0, 0, 512);
      sky.addColorStop(0, '#13183a');
      sky.addColorStop(0.55, '#c0587a');
      sky.addColorStop(0.75, '#ffb36b');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#ffe1a8';
      ctx.beginPath();
      ctx.arc(330, 330, 46, 0, Math.PI * 2);
      ctx.fill();
      const r = seeded(7);
      const layers = ['#3a2448', '#271a35', '#140f20'];
      layers.forEach((col, li) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, 512);
        let y = 330 + li * 50;
        for (let x = 0; x <= 512; x += 16) {
          y += (r() - 0.5) * 36;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(512, 512);
        ctx.fill();
      });
      break;
    }
    case 'builtin:tiles': {
      c.width = c.height = 512;
      const r = seeded(42);
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          ctx.fillStyle = `hsl(${(r() * 360) | 0},65%,${45 + r() * 20}%)`;
          ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
        }
      break;
    }
    default:
      return null;
  }
  cache.set(id, c);
  return c;
}
