/**
 * Props-driven parameter control (value in, onChange out) for views that do
 * not edit the workspace project — the Viewer and the Landscape studio.
 */
import { Dice5 } from 'lucide-react';
import type { CSSProperties } from 'react';
import { clampToDef, componentCount } from '../params/parse';
import type { ParamDef, ParamValue } from '../types/shader';

const toHex = (rgb: number[]) => '#' + rgb.slice(0, 3).map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16) / 255) : [0, 0, 0];
};
const decimals = (step: number) => (step >= 1 ? 0 : Math.min(4, Math.max(1, Math.ceil(-Math.log10(step)))));

function Range({ def, value, onChange, color }: { def: ParamDef; value: number; onChange: (v: number) => void; color?: string }) {
  const fill = ((value - def.min) / (def.max - def.min || 1)) * 100;
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={def.type === 'int' ? 1 : def.step}
        value={value}
        aria-label={def.label}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--fill': `${Math.max(0, Math.min(100, fill))}%`, ...(color ? { '--track-fill': color } : {}) } as CSSProperties}
        className="flex-1"
      />
      <span className="w-12 shrink-0 text-right font-mono text-2xs text-muted">{value.toFixed(decimals(def.type === 'int' ? 1 : def.step))}</span>
    </div>
  );
}

export function ParamField({ def, value, onChange, color }: { def: ParamDef; value: ParamValue | undefined; onChange: (v: ParamValue) => void; color?: string }) {
  const v = value ?? def.default;
  let body;
  if (def.type === 'bool') {
    body = (
      <button type="button" role="switch" aria-checked={!!v} aria-label={def.label} onClick={() => onChange(!v)} className={`relative h-5 w-9 rounded-full transition-colors ${v ? 'bg-accent' : 'bg-line'}`}>
        <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${v ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    );
  } else if (componentCount(def.type) === 1) {
    const n = v as number;
    if (def.widget === 'select' && def.options?.length) {
      body = (
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={def.label}>
          {def.options.map((o) => (
            <button key={o.value} role="radio" aria-checked={n === o.value} className={`chip ${n === o.value ? 'border-accent bg-accent/15 text-fg' : 'hover:text-fg'}`} onClick={() => onChange(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      );
    } else if (def.widget === 'seed') {
      body = (
        <div className="flex items-center gap-1">
          <input type="number" className="input font-mono" value={Math.round(n)} aria-label={def.label} onChange={(e) => onChange(clampToDef(def, Math.round(Number(e.target.value) || 0)))} />
          <button className="btn" onClick={() => onChange(Math.round(def.min + Math.random() * (def.max - def.min)))} title="Random seed" aria-label={`Random ${def.label}`}>
            <Dice5 size={13} />
          </button>
        </div>
      );
    } else {
      body = <Range def={def} value={n} onChange={(x) => onChange(def.type === 'int' ? Math.round(x) : x)} color={color} />;
    }
  } else if (def.widget === 'color') {
    const arr = v as number[];
    body = (
      <div className="flex items-center gap-2">
        <input type="color" className="h-7 w-12 cursor-pointer rounded border border-line bg-transparent" value={toHex(arr)} aria-label={def.label} onChange={(e) => onChange(arr.length === 4 ? [...fromHex(e.target.value), arr[3]] : fromHex(e.target.value))} />
        <code className="font-mono text-2xs text-muted">{toHex(arr)}</code>
      </div>
    );
  } else {
    const arr = v as number[];
    body = (
      <div className="flex flex-col gap-0.5">
        {arr.map((c, i) => (
          <Range key={i} def={{ ...def, label: `${def.label} ${'XYZW'[i]}` }} value={c} onChange={(x) => onChange(arr.map((y, j) => (j === i ? x : y)))} color={color} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1" data-field={def.name}>
      <span className="text-xs font-medium" title={def.description ?? def.name}>
        {def.label}
      </span>
      {body}
    </div>
  );
}
