import { describe, expect, it } from 'vitest';
import { lensZoomBy, lookBy, panBy, zoomBy } from '../landscape/navigation';
import { LANDSCAPE_PARAMS, LAYERED_PARAMS, RENDER_MODES, STUDIO_DEFAULTS, VOXEL_PARAMS } from '../landscape/store';

const base = { uHeading: 0, uPitch: -0.3, uAltitude: 1, uPan: [0, 0] as number[] };

describe('still-mode camera navigation', () => {
  it('both render styles expose the camera position parameter', () => {
    for (const ps of [LANDSCAPE_PARAMS, VOXEL_PARAMS, LAYERED_PARAMS]) expect(ps.find((p) => p.name === 'uPan')?.type).toBe('vec2');
  });
  it('dragging down moves the camera forward along the heading; dragging right moves it left', () => {
    const fwd = panBy(base, 0, 100, 500).uPan as number[];
    expect(fwd[0]).toBeCloseTo(0);
    expect(fwd[1]).toBeGreaterThan(0); // heading 0 looks along +Z
    const side = panBy(base, 100, 0, 500).uPan as number[];
    expect(side[0]).toBeGreaterThan(0); // screen-right is -X at heading 0, so the camera moves to +X
    expect(side[1]).toBeCloseTo(0);
  });
  it('pans further per pixel when higher up', () => {
    const low = panBy({ ...base, uAltitude: 0.2 }, 0, 100, 500).uPan as number[];
    const high = panBy({ ...base, uAltitude: 3 }, 0, 100, 500).uPan as number[];
    expect(high[1]).toBeGreaterThan(low[1] * 3);
  });
  it('zooming in dollies forward and down along a downward view, within altitude limits', () => {
    const z = zoomBy(base, 0.5);
    expect((z.uPan as number[])[1]).toBeGreaterThan(0);
    expect(z.uAltitude as number).toBeLessThan(1);
    const out = zoomBy(base, -0.5);
    expect(out.uAltitude as number).toBeGreaterThan(1);
    let v: Record<string, unknown> = { ...base };
    for (let i = 0; i < 50; i++) v = { ...v, ...zoomBy(v as never, 0.6) };
    expect(v.uAltitude).toBeGreaterThanOrEqual(0.05);
  });
  it('turning wraps the heading and clamps the pitch', () => {
    const l = lookBy({ ...base, uHeading: 6.2 }, 100, -10000, 300, 300);
    expect(l.uHeading as number).toBeGreaterThanOrEqual(0);
    expect(l.uHeading as number).toBeLessThan(Math.PI * 2);
    expect(l.uPitch).toBe(0.5);
  });
  it('flat styles zoom with the lens, within its range', () => {
    expect(lensZoomBy({ uFov: 1.4 }, 0.5).uFov as number).toBeGreaterThan(1.4);
    expect(lensZoomBy({ uFov: 1.4 }, -0.5).uFov as number).toBeLessThan(1.4);
    expect(lensZoomBy({ uFov: 2.9 }, 0.6).uFov).toBe(3);
  });
});

describe('Layered 2D render style', () => {
  it('is offered by the studio and shares the world parameters with the 3D styles', () => {
    expect(RENDER_MODES.map((m) => m.id)).toEqual(['smooth', 'blocks', 'layered']);
    const shared = ['uStyle', 'uSeed', 'uScale', 'uHeight', 'uRoughness', 'uSnowLine', 'uPlants', 'uForest', 'uWaterLevel', 'uSunElevation', 'uSunAzimuth', 'uClouds', 'uFog', 'uAltitude', 'uHeading', 'uFlySpeed', 'uFov'];
    for (const n of shared) {
      const a = LAYERED_PARAMS.find((p) => p.name === n);
      const b = LANDSCAPE_PARAMS.find((p) => p.name === n);
      expect(a, n).toBeTruthy();
      expect({ ...a, group: undefined }, n).toEqual({ ...b, group: undefined });
    }
    expect(LAYERED_PARAMS.filter((p) => p.group === 'Layers').map((p) => p.name)).toEqual(['uLayers', 'uPoster', 'uDepthSpread']);
    expect(STUDIO_DEFAULTS.uLayers).toBe(6);
  });
});
