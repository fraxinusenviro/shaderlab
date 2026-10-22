/** A self-contained live shader canvas (used by A/B comparison). */
import { useEffect, useRef, useState } from 'react';
import { applyModulations } from '../modulation/modulate';
import { resolveChannel } from '../renderer/channels';
import type { Clock } from '../renderer/clock';
import { ShaderRenderer } from '../renderer/engine';
import { useSettings } from '../state/settings';
import type { ChannelBinding, Modulation, ParamDef, ParamValue, ShaderFormat } from '../types/shader';
import { bindPointer } from '../workspace/Viewport';

export interface LiveCanvasProps {
  fragment: string;
  format: ShaderFormat;
  vertex?: string;
  params: ParamDef[];
  values: Record<string, ParamValue>;
  modulations?: Record<string, Modulation>;
  channels: ChannelBinding[];
  clock: Clock;
  label: string;
}

export function LiveCanvas(props: LiveCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const r = useRef<ShaderRenderer | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [err, setErr] = useState<string | null>(null);
  const settings = useSettings();

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full touch-none';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', latest.current.label);
    ref.current!.appendChild(canvas);
    let renderer: ShaderRenderer;
    try {
      renderer = new ShaderRenderer(canvas, { clock: props.clock, preferWebGL2: settings.preferWebGL2 });
    } catch (e) {
      setErr((e as Error).message);
      canvas.remove();
      return;
    }
    // Comparison renders two canvases; keep each one lighter.
    renderer.settings = { pixelRatio: Math.min(1, settings.pixelRatio), maxPixels: Math.min(settings.maxPixels, 1920 * 1080), fpsCap: settings.fpsCap };
    renderer.valueSource = (t) => {
      const p = latest.current;
      return applyModulations(p.params, p.values, p.modulations ?? {}, t);
    };
    const unbind = bindPointer(canvas, () => r.current);
    r.current = renderer;
    renderer.start();
    return () => {
      unbind();
      renderer.dispose();
      canvas.remove();
      r.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.clock, settings.preferWebGL2]);

  useEffect(() => {
    const renderer = r.current;
    if (!renderer) return;
    const out = renderer.setShader({ fragment: props.fragment, format: props.format, vertex: props.vertex, params: props.params });
    setErr(out.ok ? null : out.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message).join('\n') || 'Compile error');
  }, [props.fragment, props.format, props.vertex, props.params, props.clock, settings.preferWebGL2]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      for (let i = 0; i < 4; i++) {
        const b = props.channels[i];
        const src = b?.assetId ? await resolveChannel(b.assetId) : null;
        if (alive) r.current?.setChannel(i, src, b ?? undefined);
      }
    })();
    return () => {
      alive = false;
    };
  }, [props.channels, props.clock, settings.preferWebGL2]);

  useEffect(() => {
    r.current?.requestRender();
  }, [props.values]);

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={ref} className="h-full w-full" />
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-2xs text-white">{props.label}</div>
      {err && <div className="absolute inset-x-2 bottom-2 whitespace-pre-wrap rounded bg-black/80 p-2 font-mono text-2xs text-danger">{err}</div>}
    </div>
  );
}
