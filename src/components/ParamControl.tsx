import { Dice5, Lock, LockOpen, RotateCcw, SlidersHorizontal, Waves } from 'lucide-react';
import { memo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { categorizeParam, MUTATION_CATEGORIES } from '../mutations/categories';
import { randomSeed } from '../mutations/rng';
import { randomizeParam } from '../mutations/uniform';
import { clampToDef, componentCount } from '../params/parse';
import { useSettings } from '../state/settings';
import { useUI } from '../state/ui';
import { useWorkspace } from '../state/workspace';
import type { ParamDef, ParamValue } from '../types/shader';

const fmt = (v: number, step: number) => {
  const decimals = step >= 1 ? 0 : Math.min(5, Math.max(1, Math.ceil(-Math.log10(step))));
  return v.toFixed(decimals);
};

export const categoryColor = (def: ParamDef) => MUTATION_CATEGORIES.find((c) => c.id === categorizeParam(def))?.color ?? '#94a3b8';

function toHex(rgb: number[]): string {
  return '#' + rgb.slice(0, 3).map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');
}
function fromHex(hex: string): number[] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16) / 255) : [0, 0, 0];
}

function Slider({ def, value, onChange, min = def.min, max = def.max, color, compact }: { def: ParamDef; value: number; onChange: (v: number) => void; min?: number; max?: number; color: string; compact: boolean }) {
  const fill = ((value - min) / (max - min || 1)) * 100;
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={def.type === 'int' ? 1 : def.step}
        value={value}
        aria-label={def.label}
        style={{ '--fill': `${Math.max(0, Math.min(100, fill))}%`, '--track-fill': color } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
      />
      {!compact && (
        <input
          type="number"
          className="input w-20 shrink-0 px-1.5 py-0.5 text-right font-mono"
          value={fmt(value, def.type === 'int' ? 1 : def.step)}
          step={def.type === 'int' ? 1 : def.step}
          aria-label={`${def.label} value`}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(def.type === 'int' ? Math.round(n) : n);
          }}
        />
      )}
    </div>
  );
}

function XYPad({ def, value, onChange }: { def: ParamDef; value: number[]; onChange: (v: number[]) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const span = def.max - def.min || 1;
  const nx = (value[0] - def.min) / span;
  const ny = (value[1] - def.min) / span;
  const update = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    onChange([def.min + x * span, def.min + y * span]);
  };
  return (
    <div
      ref={ref}
      role="slider"
      aria-label={`${def.label} XY pad`}
      aria-valuetext={`${value[0].toFixed(3)}, ${value[1].toFixed(3)}`}
      tabIndex={0}
      className="relative h-28 touch-none rounded-md border border-line bg-bg"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => e.buttons && update(e)}
      onKeyDown={(e) => {
        const d = def.step * (e.shiftKey ? 10 : 1);
        const k: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
        if (k[e.key]) {
          e.preventDefault();
          onChange([clampToDef(def, value[0] + k[e.key][0]), clampToDef(def, value[1] + k[e.key][1])]);
        }
      }}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
      <div className="absolute h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white bg-accent shadow" style={{ left: `${nx * 100}%`, bottom: `${ny * 100}%` }} />
    </div>
  );
}

function AngleDial({ def, value, onChange }: { def: ParamDef; value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const span = def.max - def.min || 1;
  const a = ((value - def.min) / span) * Math.PI * 2;
  const update = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    let ang = Math.atan2(-(e.clientY - (r.top + r.height / 2)), e.clientX - (r.left + r.width / 2));
    if (ang < 0) ang += Math.PI * 2;
    onChange(def.min + (ang / (Math.PI * 2)) * span);
  };
  return (
    <div
      ref={ref}
      className="relative h-10 w-10 shrink-0 touch-none rounded-full border border-line bg-bg"
      aria-hidden
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e);
      }}
      onPointerMove={(e) => e.buttons && update(e)}
    >
      <div className="absolute left-1/2 top-1/2 h-0.5 w-1/2 origin-left rounded bg-accent" style={{ transform: `rotate(${-a}rad)` }} />
    </div>
  );
}

function RangeEditor({ def }: { def: ParamDef }) {
  const update = useWorkspace((s) => s.updateParamDef);
  const isScalar = componentCount(def.type) === 1;
  const num = (k: 'min' | 'max' | 'step', v: string) => {
    const n = Number(v);
    if (Number.isFinite(n)) update(def.name, { [k]: n });
  };
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border border-line bg-bg/60 p-2 text-2xs sm:grid-cols-4">
      <label className="flex flex-col gap-0.5">
        <span className="text-muted">Min</span>
        <input className="input font-mono" type="number" defaultValue={def.min} onBlur={(e) => num('min', e.target.value)} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-muted">Max</span>
        <input className="input font-mono" type="number" defaultValue={def.max} onBlur={(e) => num('max', e.target.value)} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-muted">Step</span>
        <input className="input font-mono" type="number" defaultValue={def.step} onBlur={(e) => num('step', e.target.value)} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-muted">Default</span>
        <input
          className="input font-mono"
          defaultValue={Array.isArray(def.default) ? def.default.join(', ') : String(def.default)}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            if (def.type === 'bool') update(def.name, { default: /^(true|1)$/i.test(raw) });
            else if (isScalar) {
              const n = Number(raw);
              if (Number.isFinite(n)) update(def.name, { default: n });
            } else {
              const parts = raw.split(/[,\s]+/).map(Number);
              if (parts.length === componentCount(def.type) && parts.every(Number.isFinite)) update(def.name, { default: parts });
            }
          }}
        />
      </label>
      <label className="col-span-2 flex flex-col gap-0.5">
        <span className="text-muted">Label</span>
        <input className="input" defaultValue={def.label} onBlur={(e) => e.target.value.trim() && update(def.name, { label: e.target.value.trim() })} />
      </label>
      <label className="col-span-2 flex flex-col gap-0.5">
        <span className="text-muted">Group</span>
        <input className="input" defaultValue={def.group} onBlur={(e) => e.target.value.trim() && update(def.name, { group: e.target.value.trim() })} />
      </label>
      <p className="col-span-full text-muted">
        Tip: persist ranges in source with an annotation, e.g. <code className="font-mono">// @param min=0 max=20</code>
      </p>
    </div>
  );
}

function ParamControlInner({ def }: { def: ParamDef }) {
  const value = useWorkspace((s) => s.project?.values[def.name]) ?? def.default;
  const locked = useWorkspace((s) => s.project?.locked.includes(def.name) ?? false);
  const modulated = useWorkspace((s) => !!s.project?.modulations[def.name]?.enabled);
  const selected = useWorkspace((s) => s.selectedParam === def.name);
  const { setValue, resetParam, toggleLock, select } = useWorkspace.getState();
  const compact = useSettings((s) => s.compactControls);
  const [editing, setEditing] = useState(false);
  const color = categoryColor(def);
  const set = (v: ParamValue) => setValue(def.name, v);

  let body: ReactNode;
  if (def.type === 'bool') {
    body = (
      <button type="button" role="switch" aria-checked={!!value} aria-label={def.label} onClick={() => setValue(def.name, !value, { coalesce: false })} className={`relative h-5 w-9 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-line'}`}>
        <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    );
  } else if (componentCount(def.type) === 1) {
    const v = value as number;
    if (def.widget === 'select' && def.options?.length) {
      body = (
        <select className="input" value={v} aria-label={def.label} onChange={(e) => set(Number(e.target.value))}>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    } else if (def.widget === 'seed') {
      body = (
        <div className="flex items-center gap-2">
          <input type="number" className="input font-mono" value={Math.round(v)} aria-label={def.label} onChange={(e) => set(Math.round(Number(e.target.value) || 0))} />
          <button className="btn" onClick={() => set(Math.round(def.min + Math.random() * (def.max - def.min)))} title="New random seed">
            <Dice5 size={14} /> New seed
          </button>
        </div>
      );
    } else if (def.widget === 'number') {
      body = <input type="number" className="input font-mono" step={def.step} value={v} aria-label={def.label} onChange={(e) => set(Number(e.target.value))} />;
    } else if (def.widget === 'angle') {
      body = (
        <div className="flex items-center gap-2">
          <AngleDial def={def} value={v} onChange={set} />
          <div className="flex-1">
            <Slider def={def} value={v} onChange={set} color={color} compact={compact} />
          </div>
        </div>
      );
    } else {
      body = <Slider def={def} value={v} onChange={set} color={color} compact={compact} />;
    }
  } else {
    const arr = value as number[];
    const n = componentCount(def.type);
    const names = def.widget === 'color' ? ['R', 'G', 'B', 'A'] : ['X', 'Y', 'Z', 'W'];
    body = (
      <div className="flex flex-col gap-1">
        {def.widget === 'color' && (
          <div className="flex items-center gap-2">
            <input type="color" className="h-8 w-12 cursor-pointer rounded border border-line bg-transparent" value={toHex(arr)} aria-label={`${def.label} colour`} onChange={(e) => set(n === 4 ? [...fromHex(e.target.value), arr[3]] : fromHex(e.target.value))} />
            <code className="font-mono text-2xs text-muted">{toHex(arr)}</code>
          </div>
        )}
        {def.widget === 'xy' && n === 2 && <XYPad def={def} value={arr} onChange={set} />}
        {(def.widget !== 'color' || !compact) &&
          arr.slice(0, n).map((c, i) =>
            def.widget === 'color' && compact ? null : (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-3 font-mono text-2xs text-muted">{names[i]}</span>
                <div className="flex-1">
                  <Slider def={{ ...def, label: `${def.label} ${names[i]}` }} value={c} onChange={(x) => set(arr.map((y, j) => (j === i ? x : y)))} color={color} compact={compact} />
                </div>
              </div>
            ),
          )}
      </div>
    );
  }

  return (
    <div
      className={`group border-l-2 px-3 py-2 ${selected ? 'bg-panel2' : 'hover:bg-panel2/50'} ${locked ? 'opacity-80' : ''}`}
      style={{ borderLeftColor: color }}
      onFocusCapture={() => !selected && select(def.name)}
      onPointerDownCapture={() => !selected && select(def.name)}
      data-param={def.name}
    >
      <div className="mb-1 flex items-center gap-1">
        <span className="flex-1 truncate text-xs font-medium" title={`${def.name} (${def.type})${def.description ? ' — ' + def.description : ''}`}>
          {def.label}
          {modulated && <Waves size={11} className="ml-1 inline text-accent" aria-label="modulated" />}
        </span>
        <span className={`flex items-center ${compact ? 'opacity-0 group-hover:opacity-100' : ''}`}>
          <button className="btn-icon h-6 w-6" title="Randomise" aria-label={`Randomise ${def.label}`} disabled={locked} onClick={() => setValue(def.name, randomizeParam(def, randomSeed()), { coalesce: false })}>
            <Dice5 size={13} />
          </button>
          <button className="btn-icon h-6 w-6" title="Reset to default" aria-label={`Reset ${def.label}`} onClick={() => resetParam(def.name)}>
            <RotateCcw size={13} />
          </button>
          <button className={`btn-icon h-6 w-6 ${locked ? 'text-accent' : ''}`} title={locked ? 'Unlock (allow mutation)' : 'Lock (exclude from mutation)'} aria-label={`${locked ? 'Unlock' : 'Lock'} ${def.label}`} aria-pressed={locked} onClick={() => toggleLock(def.name)}>
            {locked ? <Lock size={13} /> : <LockOpen size={13} />}
          </button>
          <button
            className={`btn-icon h-6 w-6 ${modulated ? 'text-accent' : ''}`}
            title="Modulate"
            aria-label={`Modulate ${def.label}`}
            onClick={() => {
              select(def.name);
              useUI.getState().set({ rightTab: 'modulate' });
            }}
          >
            <Waves size={13} />
          </button>
          {def.type !== 'bool' && (
            <button className={`btn-icon h-6 w-6 ${editing ? 'text-accent' : ''}`} title="Edit range / default" aria-label={`Edit range of ${def.label}`} aria-expanded={editing} onClick={() => setEditing(!editing)}>
              <SlidersHorizontal size={13} />
            </button>
          )}
        </span>
      </div>
      {body}
      {!compact && def.description && <p className="mt-1 text-2xs text-muted">{def.description}</p>}
      {editing && <RangeEditor key={`${def.min}-${def.max}-${def.step}`} def={def} />}
    </div>
  );
}

export const ParamControl = memo(ParamControlInner);
