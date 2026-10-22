/**
 * Elevation-data panel for the Landscape studio: load NRCan HRDEM / MRDEM
 * terrain around a place (or a local GeoTIFF), then render it with the
 * studio's water, sky, vegetation and block styles.
 */
import { Crosshair, Download, Loader2, MapPin, Mountain, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { forgetChannel } from '../renderer/channels';
import { toast } from '../state/ui';
import { uid } from '../storage/project';
import { repository } from '../storage/repository';
import type { DemData, DemLayer, DemSourceId } from '../dem/hrdem';
import { useLandscape, type DemInfo } from './store';

export interface DemPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  sizeKm: number;
  note: string;
}

/** Places checked to have good CanElevation coverage (HRDEM unless noted). */
export const DEM_PLACES: DemPlace[] = [
  { id: 'cheticamp', name: 'Cape Breton Highlands, NS', lat: 46.66, lon: -60.93, sizeKm: 8, note: 'Escarpment above Chéticamp · HRDEM 2 m' },
  { id: 'halifax', name: 'Halifax Harbour, NS', lat: 44.648, lon: -63.575, sizeKm: 6, note: 'Citadel Hill and harbour · HRDEM 1 m' },
  { id: 'perce', name: 'Percé Rock, QC', lat: 48.523, lon: -64.21, sizeKm: 5, note: 'Coastal cliffs · HRDEM 1 m' },
  { id: 'montroyal', name: 'Mont Royal, Montréal, QC', lat: 45.505, lon: -73.588, sizeKm: 4, note: 'Urban mountain · HRDEM 1 m' },
  { id: 'hautes-gorges', name: 'Hautes-Gorges, QC', lat: 47.82, lon: -70.45, sizeKm: 10, note: 'Deep glacial valley · HRDEM 2 m' },
  { id: 'banff', name: 'Banff & Mount Rundle, AB', lat: 51.15, lon: -115.53, sizeKm: 15, note: 'Rockies · MRDEM 30 m' },
  { id: 'north-shore', name: 'North Shore Mountains, BC', lat: 49.38, lon: -123.08, sizeKm: 15, note: 'Coast Mountains · MRDEM 30 m' },
  { id: 'gros-morne', name: 'Gros Morne Tablelands, NL', lat: 49.465, lon: -57.98, sizeKm: 12, note: 'Fjord and plateau · MRDEM 30 m' },
];

const SIZES_KM = [1, 2, 4, 6, 8, 12, 15, 25, 40, 60];

/** Store a DEM as a lossless 16-bit-in-RGBA PNG asset and switch the studio to it. */
export async function applyDem(dem: DemData, layer: DemLayer | 'file'): Promise<void> {
  const { encodeDem } = await import('../dem/hrdem');
  const c = document.createElement('canvas');
  c.width = dem.width;
  c.height = dem.height;
  c.getContext('2d')!.putImageData(encodeDem(dem), 0, 0);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));
  const id = uid('dem_');
  await repository.putAsset({ id, name: `DEM ${dem.label}.png`, mime: 'image/png', blob, createdAt: Date.now() });
  forgetChannel(id);
  const info: DemInfo = {
    assetId: id,
    label: dem.label,
    source: dem.source,
    min: dem.min,
    max: dem.max,
    sizeM: dem.sizeM,
    pixelM: dem.pixelM,
    validFraction: dem.validFraction,
    attribution: dem.attribution,
    center: dem.center ?? null,
    layer,
    width: dem.width,
  };
  useLandscape.getState().applyDem(info);
}

export function ElevationPanel() {
  const dem = useLandscape((s) => s.dem);
  const values = useLandscape((s) => s.values);
  const setMany = useLandscape((s) => s.setMany);
  const usingDem = values.uTerrainSource === 1 && !!dem;
  const [lat, setLat] = useState(dem?.center?.[1]?.toFixed(5) ?? '46.66');
  const [lon, setLon] = useState(dem?.center?.[0]?.toFixed(5) ?? '-60.93');
  const [sizeKm, setSizeKm] = useState(8);
  const [px, setPx] = useState(512);
  const [layer, setLayer] = useState<DemLayer>('dtm');
  const [source, setSource] = useState<DemSourceId>('auto');
  const [busy, setBusy] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async (la: number, lo: number, km: number) => {
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return toast('error', 'Enter a latitude and longitude in decimal degrees.');
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setBusy('Contacting the CanElevation catalogue…');
    try {
      const { loadCanElevation } = await import('../dem/hrdem');
      const d = await loadCanElevation({ lat: la, lon: lo, sizeM: km * 1000, px, layer, source, signal: ac.signal, onProgress: setBusy });
      await applyDem(d, layer);
      const cov = Math.round(d.validFraction * 100);
      toast(cov < 90 ? 'warn' : 'success', `Loaded ${d.source}: ${d.min.toFixed(0)}–${d.max.toFixed(0)} m, ${cov}% coverage${cov < 90 ? ' (gaps render as sea level / base)' : ''}.`);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('error', `Could not load elevation data: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const here = () => {
    if (!navigator.geolocation) return toast('warn', 'Geolocation is not available in this browser.');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(5));
        setLon(p.coords.longitude.toFixed(5));
      },
      () => toast('warn', 'Location permission was denied or unavailable.'),
      { timeout: 10000 },
    );
  };

  return (
    <div className="flex flex-col gap-3" data-testid="elevation-panel">
      <div className="flex rounded-md border border-line p-0.5 text-xs" role="radiogroup" aria-label="Terrain source">
        <button role="radio" aria-checked={!usingDem} className={`flex-1 rounded px-2 py-1 ${!usingDem ? 'bg-panel2 text-fg' : 'text-muted'}`} onClick={() => setMany({ uTerrainSource: 0 })} data-testid="source-procedural">
          Procedural
        </button>
        <button
          role="radio"
          aria-checked={usingDem}
          className={`flex-1 rounded px-2 py-1 ${usingDem ? 'bg-panel2 text-fg' : 'text-muted'} disabled:opacity-40`}
          disabled={!dem}
          onClick={() => setMany({ uTerrainSource: 1 })}
          title={dem ? 'Use the loaded elevation data' : 'Load elevation data first'}
          data-testid="source-dem"
        >
          Elevation data
        </button>
      </div>

      {dem && (
        <div className="rounded-md border border-line bg-bg/60 p-2 text-2xs" data-testid="dem-info">
          <div className="text-xs font-semibold">{dem.label}</div>
          <div className="text-muted">
            {dem.source} · {dem.min.toFixed(1)}–{dem.max.toFixed(1)} m · {Math.round(dem.validFraction * 100)}% coverage · ~{dem.pixelM.toFixed(dem.pixelM < 10 ? 1 : 0)} m/pixel · {dem.width}px
          </div>
          <div className="mt-1 text-muted">{dem.attribution}</div>
        </div>
      )}

      <div>
        <div className="label mb-1">Places</div>
        <div className="grid grid-cols-1 gap-1">
          {DEM_PLACES.map((p) => (
            <button
              key={p.id}
              className="flex items-start gap-2 rounded-md border border-line px-2 py-1 text-left hover:border-muted disabled:opacity-50"
              disabled={!!busy}
              onClick={() => {
                setLat(String(p.lat));
                setLon(String(p.lon));
                setSizeKm(p.sizeKm);
                void load(p.lat, p.lon, p.sizeKm);
              }}
              data-testid="dem-place"
              data-place={p.id}
            >
              <MapPin size={12} className="mt-0.5 shrink-0 text-accent" />
              <span>
                <span className="block text-xs font-medium">{p.name}</span>
                <span className="block text-2xs text-muted">
                  {p.note} · {p.sizeKm} km
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 rounded-md border border-line p-2">
        <div className="label">Custom area</div>
        <div className="grid grid-cols-2 gap-1">
          <input className="input font-mono" value={lat} onChange={(e) => setLat(e.target.value)} aria-label="Latitude" placeholder="Latitude" />
          <input className="input font-mono" value={lon} onChange={(e) => setLon(e.target.value)} aria-label="Longitude" placeholder="Longitude" />
        </div>
        <div className="grid grid-cols-2 gap-1">
          <select className="input" value={sizeKm} onChange={(e) => setSizeKm(Number(e.target.value))} aria-label="Area size">
            {SIZES_KM.map((k) => (
              <option key={k} value={k}>
                {k} km square
              </option>
            ))}
          </select>
          <select className="input" value={px} onChange={(e) => setPx(Number(e.target.value))} aria-label="Resolution">
            {[256, 512, 1024].map((k) => (
              <option key={k} value={k}>
                {k}×{k} samples
              </option>
            ))}
          </select>
          <select className="input" value={layer} onChange={(e) => setLayer(e.target.value as DemLayer)} aria-label="Surface">
            <option value="dtm">DTM — bare earth</option>
            <option value="dsm">DSM — with buildings & canopy</option>
          </select>
          <select className="input" value={source} onChange={(e) => setSource(e.target.value as DemSourceId)} aria-label="Dataset">
            <option value="auto">Auto (HRDEM → MRDEM)</option>
            <option value="hrdem-mosaic-1m">HRDEM 1 m</option>
            <option value="hrdem-mosaic-2m">HRDEM 2 m</option>
            <option value="mrdem-30">MRDEM 30 m</option>
          </select>
        </div>
        <div className="flex gap-1">
          <button className="btn btn-primary flex-1" disabled={!!busy} onClick={() => void load(Number(lat), Number(lon), sizeKm)} data-testid="dem-load">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Load elevation
          </button>
          <button className="btn" onClick={here} title="Use my location" aria-label="Use my location">
            <Crosshair size={13} />
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} title="Open a GeoTIFF DEM from this device" aria-label="Upload GeoTIFF">
            <Upload size={13} />
          </button>
        </div>
        {busy && (
          <div className="flex items-center gap-2 text-2xs text-muted" role="status">
            <span className="flex-1">{busy}</span>
            <button className="btn-icon h-5 w-5" onClick={() => abort.current?.abort()} aria-label="Cancel">
              <X size={11} />
            </button>
          </div>
        )}
        <p className="text-2xs text-muted">
          Canada only. Data streams from Natural Resources Canada's CanElevation series (HRDEM 1–2 m LiDAR, MRDEM 30 m national) — only the tiles needed are downloaded. Requires a network connection; loaded terrain is kept in this browser.
        </p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".tif,.tiff,image/tiff"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(`Reading ${f.name}…`);
          try {
            const { loadGeoTiffFile } = await import('../dem/hrdem');
            const d = await loadGeoTiffFile(f, f.name, px);
            await applyDem(d, 'file');
            toast('success', `Loaded ${f.name}: ${d.min.toFixed(1)}–${d.max.toFixed(1)} m.`);
          } catch (err) {
            toast('error', `Could not read ${f.name}: ${(err as Error).message}`);
          } finally {
            setBusy(null);
          }
        }}
      />
      {usingDem && (
        <div className="flex flex-wrap gap-1">
          <button className="chip hover:text-fg" onClick={() => useLandscape.getState().fitDem()} title="Choose exaggeration and camera to suit the data">
            <Mountain size={11} /> Auto-fit view
          </button>
          <button className="chip hover:text-fg" onClick={() => setMany({ uWaterLevel: -0.6 })}>
            No water
          </button>
          <button className="chip hover:text-fg" onClick={() => useLandscape.getState().setWaterElevation(0.3)}>
            Sea level
          </button>
          <button className="chip hover:text-fg" onClick={() => setMany({ uForest: 0, uShrubs: 0 })} title="Use with the DSM layer, where canopy is already in the data">
            No generated trees
          </button>
        </div>
      )}
    </div>
  );
}
