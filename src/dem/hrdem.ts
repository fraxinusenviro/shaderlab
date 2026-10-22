/**
 * Elevation data access: NRCan CanElevation HRDEM / MRDEM cloud-optimised
 * GeoTIFFs via the geo.ca STAC catalogue, plus user-supplied GeoTIFFs.
 *
 * Only the overview level and window needed are fetched, using HTTP range
 * requests (the S3 bucket allows CORS with Range). Data is licensed under the
 * Open Government Licence – Canada.
 */
import { fromArrayBuffer, fromUrl, type GeoTIFF, type GeoTIFFImage } from 'geotiff';
import { fromLcc, toLcc } from './lcc';

export const STAC_API = 'https://datacube.services.geo.ca/stac/api';
export const OGL_ATTRIBUTION = 'Contains information licensed under the Open Government Licence – Canada. Source: Natural Resources Canada, CanElevation Series (HRDEM / MRDEM).';

export type DemLayer = 'dtm' | 'dsm';
export type DemSourceId = 'auto' | 'hrdem-mosaic-1m' | 'hrdem-mosaic-2m' | 'mrdem-30';

export interface DemData {
  width: number;
  height: number;
  /** Elevations in metres, row-major from the north-west corner; invalid cells are NaN. */
  data: Float32Array;
  min: number;
  max: number;
  validFraction: number;
  /** Ground extent of the raster in metres (east-west, north-south). */
  sizeM: [number, number];
  pixelM: number;
  label: string;
  source: string;
  attribution: string;
  center?: [number, number];
}

export interface DemRequest {
  lon: number;
  lat: number;
  /** Side of the square area in metres. */
  sizeM: number;
  /** Output resolution in pixels (square). */
  px: number;
  layer: DemLayer;
  source: DemSourceId;
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
}

const NODATA_THRESHOLD = -1000;

export async function findAsset(collection: string, lon: number, lat: number, layer: DemLayer, signal?: AbortSignal): Promise<{ href: string; item: string } | null> {
  const d = 1e-4;
  const url = `${STAC_API}/search?collections=${collection}&bbox=${lon - d},${lat - d},${lon + d},${lat + d}&limit=5`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Catalogue search failed (${res.status}).`);
  const json = (await res.json()) as { features?: { id: string; assets: Record<string, { href: string }> }[] };
  const f = json.features?.find((x) => x.assets[layer]);
  return f ? { href: f.assets[layer].href, item: f.id } : null;
}

/** Choose the overview whose pixel size best matches the requested one (never coarser than needed when possible). */
export function chooseOverview(baseRes: number, baseWidth: number, widths: number[], wantRes: number): number {
  let best = 0;
  for (let i = 0; i < widths.length; i++) {
    const res = (baseRes * baseWidth) / widths[i];
    if (res <= wantRes * 1.01) best = i;
  }
  return best;
}

/** Bilinear resample ignoring NaN cells. */
export function resample(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  if (sw === dw && sh === dh) return src;
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const fy = ((y + 0.5) * sh) / dh - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)));
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = Math.min(1, Math.max(0, fy - y0));
    for (let x = 0; x < dw; x++) {
      const fx = ((x + 0.5) * sw) / dw - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = Math.min(1, Math.max(0, fx - x0));
      const w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
      const v = [src[y0 * sw + x0], src[y0 * sw + x1], src[y1 * sw + x0], src[y1 * sw + x1]];
      let sum = 0;
      let ws = 0;
      for (let k = 0; k < 4; k++) {
        if (!Number.isNaN(v[k])) {
          sum += v[k] * w[k];
          ws += w[k];
        }
      }
      out[y * dw + x] = ws > 0.25 ? sum / ws : NaN;
    }
  }
  return out;
}

export function summarize(data: Float32Array): { min: number; max: number; validFraction: number } {
  let min = Infinity;
  let max = -Infinity;
  let valid = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (Number.isNaN(v)) continue;
    valid++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!valid) return { min: 0, max: 0, validFraction: 0 };
  return { min, max, validFraction: valid / data.length };
}

function cleanNodata(raw: ArrayLike<number>, nodata: number | null): Float32Array {
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    out[i] = v === nodata || v < NODATA_THRESHOLD || !Number.isFinite(v) ? NaN : v;
  }
  return out;
}

async function overviewImages(tiff: GeoTIFF): Promise<GeoTIFFImage[]> {
  const n = await tiff.getImageCount();
  const imgs: GeoTIFFImage[] = [];
  for (let i = 0; i < n; i++) imgs.push(await tiff.getImage(i));
  // Masks or other subfiles can appear: keep single-band images in descending size.
  return imgs.filter((im) => im.getSamplesPerPixel() >= 1).sort((a, b) => b.getWidth() - a.getWidth());
}

/** Read a square window (centre in the raster CRS, metres) at about `px` pixels across. */
export async function readProjectedWindow(tiff: GeoTIFF, cx: number, cy: number, sizeM: number, px: number, signal?: AbortSignal) {
  const imgs = await overviewImages(tiff);
  const base = imgs[0];
  const [ox, oy] = base.getOrigin();
  const [rx] = base.getResolution();
  const idx = chooseOverview(Math.abs(rx), base.getWidth(), imgs.map((i) => i.getWidth()), sizeM / px);
  const img = imgs[idx];
  const res = (Math.abs(rx) * base.getWidth()) / img.getWidth();
  const half = sizeM / 2;
  const x0 = Math.floor((cx - half - ox) / res);
  const y0 = Math.floor((oy - (cy + half)) / res);
  const n = Math.max(2, Math.round(sizeM / res));
  const nodata = img.getGDALNoData();
  const raster = (await img.readRasters({ window: [x0, y0, x0 + n, y0 + n], samples: [0], interleave: true, fillValue: nodata ?? -32767, signal })) as unknown as ArrayLike<number>;
  const cleaned = cleanNodata(raster, nodata);
  return { data: resample(cleaned, n, n, px, px), resolution: res };
}

/** Fetch a DEM square around a longitude/latitude from HRDEM (falling back to MRDEM-30). */
export async function loadCanElevation(req: DemRequest): Promise<DemData> {
  const [cx, cy] = toLcc(req.lon, req.lat);
  const tries: string[] =
    req.source === 'auto' ? (req.sizeM > 30000 ? ['mrdem-30'] : req.sizeM > 6000 ? ['hrdem-mosaic-2m', 'mrdem-30'] : ['hrdem-mosaic-1m', 'hrdem-mosaic-2m', 'mrdem-30']) : [req.source];
  let last: DemData | null = null;
  for (const collection of tries) {
    req.onProgress?.(`Searching ${collection}…`);
    const asset = await findAsset(collection, req.lon, req.lat, req.layer, req.signal);
    if (!asset) continue;
    req.onProgress?.(`Reading ${collection} (${asset.item})…`);
    const tiff = await fromUrl(asset.href, { allowFullFile: false });
    const { data, resolution } = await readProjectedWindow(tiff, cx, cy, req.sizeM, req.px, req.signal);
    const s = summarize(data);
    const dem: DemData = {
      width: req.px,
      height: req.px,
      data,
      ...s,
      sizeM: [req.sizeM, req.sizeM],
      pixelM: Math.max(resolution, req.sizeM / req.px),
      label: `${req.lat.toFixed(4)}°, ${req.lon.toFixed(4)}° · ${(req.sizeM / 1000).toFixed(req.sizeM < 10000 ? 1 : 0)} km`,
      source: `${collection} ${req.layer.toUpperCase()}`,
      attribution: OGL_ATTRIBUTION,
      center: [req.lon, req.lat],
    };
    // Prefer a source that actually covers the area.
    if (s.validFraction >= 0.6 || collection === tries[tries.length - 1]) return dem;
    if (!last || s.validFraction > last.validFraction) last = dem;
    req.onProgress?.(`${collection} covers only ${Math.round(s.validFraction * 100)}% — trying the next source…`);
  }
  if (last) return last;
  throw new Error('No CanElevation data was found at this location (HRDEM/MRDEM cover Canada only).');
}

/** Read a user-supplied GeoTIFF DEM (any CRS) at about `px` pixels on its longer side. */
export async function loadGeoTiffFile(file: Blob, name: string, px: number): Promise<DemData> {
  const tiff = await fromArrayBuffer(await file.arrayBuffer());
  const imgs = await overviewImages(tiff);
  const base = imgs[0];
  const w = base.getWidth();
  const h = base.getHeight();
  const scale = Math.min(1, px / Math.max(w, h));
  const dw = Math.max(2, Math.round(w * scale));
  const dh = Math.max(2, Math.round(h * scale));
  // Pick the smallest overview that is still at least the output size.
  const img = [...imgs].reverse().find((im) => im.getWidth() >= dw) ?? base;
  const raw = (await img.readRasters({ samples: [0], interleave: true, width: dw, height: dh, resampleMethod: 'bilinear' })) as unknown as ArrayLike<number>;
  const data = cleanNodata(raw, img.getGDALNoData());
  const s = summarize(data);
  const [rx, ry] = base.getResolution();
  const keys = base.getGeoKeys() as Record<string, number> | null;
  const geographic = keys?.GTModelTypeGeoKey === 2;
  let sizeM: [number, number];
  let center: [number, number] | undefined;
  if (geographic) {
    // Degrees: convert using the latitude at the centre.
    const [x0, y0, x1, y1] = base.getBoundingBox();
    const lat = (y0 + y1) / 2;
    sizeM = [Math.abs(x1 - x0) * 111320 * Math.cos((lat * Math.PI) / 180), Math.abs(y1 - y0) * 110574];
    center = [(x0 + x1) / 2, lat];
  } else {
    sizeM = [Math.abs(rx) * w, Math.abs(ry) * h];
    if (keys?.ProjectedCSTypeGeoKey === 3979) {
      const [x0, y0, x1, y1] = base.getBoundingBox();
      center = fromLcc((x0 + x1) / 2, (y0 + y1) / 2);
    }
  }
  if (!s.validFraction) throw new Error(`${name} contains no valid elevation values.`);
  return {
    width: dw,
    height: dh,
    data,
    ...s,
    sizeM,
    pixelM: sizeM[0] / dw,
    label: name,
    source: 'Uploaded GeoTIFF',
    attribution: 'User-supplied elevation data.',
    center,
  };
}

// ---------------------------------------------------------------- texture encoding

/**
 * Pack elevations into RGBA8 for a lossless PNG / WebGL texture:
 * R,G = 16-bit height normalised to [min, max]; B = 255 valid / 0 nodata; A = 255.
 */
export function encodeDem(dem: DemData): ImageData {
  const out = new ImageData(dem.width, dem.height);
  const range = Math.max(1e-6, dem.max - dem.min);
  for (let i = 0; i < dem.data.length; i++) {
    const v = dem.data[i];
    const valid = !Number.isNaN(v);
    const q = valid ? Math.round(((v - dem.min) / range) * 65535) : 0;
    out.data[i * 4] = q >> 8;
    out.data[i * 4 + 1] = q & 255;
    out.data[i * 4 + 2] = valid ? 255 : 0;
    out.data[i * 4 + 3] = 255;
  }
  return out;
}

export function decodeDem(img: ImageData, min: number, max: number): Float32Array {
  const out = new Float32Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) {
    const valid = img.data[i * 4 + 2] > 127;
    out[i] = valid ? min + ((img.data[i * 4] * 256 + img.data[i * 4 + 1]) / 65535) * (max - min) : NaN;
  }
  return out;
}
