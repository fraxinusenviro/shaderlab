import { float32GeoTiff } from '../../e2e/geotiff';
import { describe, expect, it } from 'vitest';
import { fromLcc, toLcc } from '../dem/lcc';

describe('EPSG:3979 Canada Atlas Lambert', () => {
  it('maps the projection origin to (0, 0)', () => {
    const [x, y] = toLcc(-95, 49);
    expect(Math.abs(x)).toBeLessThan(1e-6);
    expect(Math.abs(y)).toBeLessThan(1e-6);
  });
  it('round-trips across Canada', () => {
    for (const [lon, lat] of [[-60.7, 46.7], [-123.1, 49.3], [-115.6, 51.2], [-75.7, 45.4], [-68.5, 63.7], [-140, 69]]) {
      const [x, y] = toLcc(lon, lat);
      const [lo, la] = fromLcc(x, y);
      expect(lo).toBeCloseTo(lon, 9);
      expect(la).toBeCloseTo(lat, 9);
    }
  });
  it('agrees with the published bounds of HRDEM mosaic tile 11_3', () => {
    // STAC: projected bbox [2500000, 0, 3000000, 500000] ↔ geographic bbox below.
    const corners = [[2500000, 0], [3000000, 0], [2500000, 500000], [3000000, 500000]].map(([x, y]) => fromLcc(x, y));
    const lons = corners.map((c) => c[0]);
    const lats = corners.map((c) => c[1]);
    expect(Math.min(...lons)).toBeCloseTo(-63.646898, 3);
    expect(Math.max(...lons)).toBeCloseTo(-55.217699, 3);
    expect(Math.min(...lats)).toBeCloseTo(41.191193, 3);
    expect(Math.max(...lats)).toBeCloseTo(47.259179, 3);
  });
});

import { chooseOverview, decodeDem, encodeDem, loadGeoTiffFile, resample, summarize, type DemData } from '../dem/hrdem';
import { demWorldHeight, fitDemValues, STUDIO_DEFAULTS, type DemInfo } from '../landscape/store';


class FakeImageData {
  data: Uint8ClampedArray;
  constructor(
    public width: number,
    public height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}
(globalThis as unknown as { ImageData: unknown }).ImageData ??= FakeImageData;

function demOf(data: number[], w: number, h: number): DemData {
  const arr = Float32Array.from(data);
  return { width: w, height: h, data: arr, ...summarize(arr), sizeM: [1000, 1000], pixelM: 1000 / w, label: 't', source: 't', attribution: '' };
}

describe('DEM processing', () => {
  it('encodes heights losslessly to 16 bits with a nodata mask', () => {
    const dem = demOf([0, 12.5, NaN, 474.04, 100, 250.25], 3, 2);
    const back = decodeDem(encodeDem(dem) as unknown as ImageData, dem.min, dem.max);
    const step = (dem.max - dem.min) / 65535;
    dem.data.forEach((v, i) => (Number.isNaN(v) ? expect(back[i]).toBeNaN() : expect(Math.abs(back[i] - v)).toBeLessThanOrEqual(step)));
  });
  it('summarises valid cells only', () => {
    expect(summarize(Float32Array.from([NaN, 5, -2, NaN]))).toEqual({ min: -2, max: 5, validFraction: 0.5 });
  });
  it('picks the coarsest overview that is still fine enough', () => {
    const widths = [250000, 125000, 62500, 31250, 15625, 7813];
    expect(chooseOverview(2, 250000, widths, 2)).toBe(0);
    expect(chooseOverview(2, 250000, widths, 16)).toBe(3);
    expect(chooseOverview(2, 250000, widths, 1000)).toBe(5);
  });
  it('resamples bilinearly and ignores nodata', () => {
    const src = Float32Array.from([0, 10, 20, NaN]);
    const out = resample(src, 2, 2, 4, 4);
    expect(out[0]).toBeCloseTo(0);
    expect(out[3]).toBeCloseTo(10);
    expect(out[12]).toBeCloseTo(20);
    expect(out.some((v) => Number.isNaN(v))).toBe(true);
  });
  it('fits exaggeration, sea and camera to the data', () => {
    const info: DemInfo = { assetId: 'a', label: 'x', source: 's', min: -1, max: 474, sizeM: [8000, 8000], pixelM: 15.6, validFraction: 0.99, attribution: '', center: null, layer: 'dtm', width: 512 };
    const v = fitDemValues(STUDIO_DEFAULTS, info);
    expect(v.uTerrainSource).toBe(1);
    const relief = demWorldHeight(v, 474) - demWorldHeight(v, -1);
    expect(relief).toBeGreaterThan(1.2);
    expect(relief).toBeLessThan(1.6);
    expect(v.uWaterLevel as number).toBeCloseTo(demWorldHeight(v, 0.3), 6);
    const inland = fitDemValues(STUDIO_DEFAULTS, { ...info, min: 150, max: 990 });
    expect(inland.uWaterLevel).toBe(-0.6);
  });
  it('reads a projected GeoTIFF DEM file', async () => {
    const w = 32;
    const h = 24;
    const values = Float32Array.from({ length: w * h }, (_, i) => 100 + (i % w) * 2);
    values[5] = -32767;
    const buf = float32GeoTiff(values, w, h, 5, 2700000, 300000, '-32767');
    const dem = await loadGeoTiffFile(new Blob([buf]), 'synthetic.tif', 64);
    expect(dem.width).toBe(32);
    expect(dem.sizeM[0]).toBeCloseTo(160);
    expect(dem.sizeM[1]).toBeCloseTo(120);
    expect(dem.min).toBeCloseTo(100);
    expect(dem.max).toBeCloseTo(162);
    expect(dem.validFraction).toBeLessThan(1);
    expect(dem.center![1]).toBeGreaterThan(40);
  });
});
