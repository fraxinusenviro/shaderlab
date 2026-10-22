/** Mutation laboratory: settings, generated variant grid, scheduled thumbnails. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { randomSeed } from '../mutations/rng';
import { DEFAULT_MUTATION_SETTINGS, generateVariant, type MutationSettings, type VariantSpec } from '../mutations/variants';
import { requestThumbnail } from '../renderer/offscreen';
import { THUMB_SIZES, useSettings } from './settings';
import { useWorkspace } from './workspace';

export interface GalleryVariant {
  key: string;
  spec: VariantSpec;
  status: 'pending' | 'ok' | 'invalid';
  thumb?: string;
  error?: string;
  favorite: boolean;
  /** Mutation-history node id once recorded. */
  nodeId?: string;
}

interface LabState {
  settings: MutationSettings;
  variants: GalleryVariant[];
  grid: 2 | 3 | 4;
  previewTime: number;
  baseName: string;
  generating: boolean;
  setSettings: (patch: Partial<MutationSettings>) => void;
  setGrid: (g: 2 | 3 | 4) => void;
  setPreviewTime: (t: number) => void;
  generate: (opts?: { newSeed?: boolean }) => void;
  regenerate: (key: string) => void;
  remove: (key: string) => void;
  toggleFavorite: (key: string) => void;
  setNodeId: (key: string, id: string) => void;
  clear: () => void;
}

const cancels = new Map<string, () => void>();
let batch = 0;

function renderThumb(v: GalleryVariant, time: number): void {
  const p = useWorkspace.getState().project;
  if (!p) return;
  const [w, h] = THUMB_SIZES[useSettings.getState().thumbQuality];
  cancels.get(v.key)?.();
  const job = requestThumbnail({
    input: { fragment: v.spec.fragment, format: p.format, vertex: p.vertex, params: v.spec.params },
    values: v.spec.values,
    channels: p.channels,
    time,
    width: w,
    height: h,
  });
  cancels.set(v.key, job.cancel);
  void job.promise.then((res) => {
    cancels.delete(v.key);
    useLab.setState((s) => ({
      variants: s.variants.map((x) =>
        x.key === v.key
          ? {
              ...x,
              status: res.ok ? 'ok' : 'invalid',
              thumb: res.dataUrl ?? x.thumb,
              error: res.ok ? undefined : res.compile.diagnostics.filter((d) => d.severity === 'error').map((d) => (d.line ? `L${d.line}: ` : '') + d.message).join('\n') || 'Compilation failed',
            }
          : x,
      ),
      generating: s.variants.some((x) => x.key !== v.key && x.status === 'pending'),
    }));
  });
}

export const useLab = create<LabState>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_MUTATION_SETTINGS,
      variants: [],
      grid: 3,
      previewTime: 2,
      baseName: '',
      generating: false,
      setSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
      setGrid: (grid) => set({ grid, settings: { ...get().settings, count: grid * grid } }),
      setPreviewTime: (previewTime) => {
        set({ previewTime });
        for (const v of get().variants) if (v.status !== 'invalid') renderThumb(v, previewTime);
      },
      generate: (opts) => {
        const p = useWorkspace.getState().project;
        if (!p) return;
        cancels.forEach((c) => c());
        cancels.clear();
        let settings = { ...get().settings, count: get().grid * get().grid };
        if (opts?.newSeed) settings = { ...settings, seed: randomSeed() };
        const base = { fragment: p.fragment, format: p.format, params: p.params, values: p.values, locked: p.locked };
        batch++;
        const variants: GalleryVariant[] = Array.from({ length: settings.count }, (_, i) => ({
          key: `${batch}-${i}`,
          spec: generateVariant(base, settings, i),
          status: 'pending',
          favorite: false,
        }));
        set({ settings, variants, generating: true, baseName: p.name });
        variants.forEach((v) => renderThumb(v, get().previewTime));
      },
      regenerate: (key) => {
        const p = useWorkspace.getState().project;
        const v = get().variants.find((x) => x.key === key);
        if (!p || !v) return;
        const base = { fragment: p.fragment, format: p.format, params: p.params, values: p.values, locked: p.locked };
        // Fresh seed for this slot only.
        const spec = generateVariant(base, { ...get().settings, seed: randomSeed() }, v.spec.index);
        const nv: GalleryVariant = { key: `${key}r${batch++}`, spec, status: 'pending', favorite: false };
        set({ variants: get().variants.map((x) => (x.key === key ? nv : x)) });
        renderThumb(nv, get().previewTime);
      },
      remove: (key) => {
        cancels.get(key)?.();
        set({ variants: get().variants.filter((x) => x.key !== key) });
      },
      toggleFavorite: (key) => set({ variants: get().variants.map((x) => (x.key === key ? { ...x, favorite: !x.favorite } : x)) }),
      setNodeId: (key, id) => set({ variants: get().variants.map((x) => (x.key === key ? { ...x, nodeId: id } : x)) }),
      clear: () => {
        cancels.forEach((c) => c());
        set({ variants: [] });
      },
    }),
    { name: 'shader-forge:lab', version: 1, partialize: (s) => ({ settings: s.settings, grid: s.grid, previewTime: s.previewTime }) },
  ),
);
