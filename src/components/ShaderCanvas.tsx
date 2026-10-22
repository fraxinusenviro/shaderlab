/**
 * Standalone full-size shader canvas with its own renderer and clock, used by
 * the Viewer and the Landscape studio (independent of the editor workspace).
 */
import { useEffect, useRef, useState } from 'react';
import { applyModulations } from '../modulation/modulate';
import { resolveChannel } from '../renderer/channels';
import type { Clock } from '../renderer/clock';
import { ShaderRenderer, type CompileOutcome, type RenderStats } from '../renderer/engine';
import { useSettings } from '../state/settings';
import type { ChannelBinding, Modulation, ParamDef, ParamValue, ShaderFormat } from '../types/shader';
import { bindPointer } from '../workspace/Viewport';

export interface ShaderCanvasProps {
  fragment: string;
  format: ShaderFormat;
  vertex?: string;
  params: ParamDef[];
  values: Record<string, ParamValue>;
  modulations?: Record<string, Modulation>;
  channels?: ChannelBinding[];
  clock: Clock;
  /** Multiplier on device pixel ratio (defaults to the global setting). */
  pixelRatio?: number;
  maxPixels?: number;
  label: string;
  onRenderer?: (r: ShaderRenderer | null) => void;
  onCompile?: (o: CompileOutcome) => void;
  onStats?: (s: RenderStats) => void;
}

export function ShaderCanvas(props: ShaderCanvasProps) {
  const holder = useRef<HTMLDivElement>(null);
  const r = useRef<ShaderRenderer | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [fatal, setFatal] = useState<string | null>(null);
  const preferWebGL2 = useSettings((s) => s.preferWebGL2);
  const settings = useSettings();

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full touch-none';
    canvas.dataset.testid = 'shader-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', latest.current.label);
    holder.current!.appendChild(canvas);
    let renderer: ShaderRenderer;
    try {
      renderer = new ShaderRenderer(canvas, { clock: props.clock, preferWebGL2 });
    } catch (e) {
      setFatal((e as Error).message);
      canvas.remove();
      return;
    }
    renderer.valueSource = (t) => {
      const p = latest.current;
      return applyModulations(p.params, p.values, p.modulations ?? {}, t);
    };
    renderer.onStats = (s) => latest.current.onStats?.(s);
    const unbind = bindPointer(canvas, () => r.current);
    r.current = renderer;
    renderer.start();
    latest.current.onRenderer?.(renderer);
    return () => {
      latest.current.onRenderer?.(null);
      unbind();
      renderer.dispose();
      canvas.remove();
      r.current = null;
    };
  }, [props.clock, preferWebGL2]);

  useEffect(() => {
    const renderer = r.current;
    if (!renderer) return;
    renderer.settings = { pixelRatio: props.pixelRatio ?? settings.pixelRatio, maxPixels: props.maxPixels ?? settings.maxPixels, fpsCap: settings.fpsCap };
    renderer.requestRender();
  }, [props.pixelRatio, props.maxPixels, settings.pixelRatio, settings.maxPixels, settings.fpsCap, props.clock, preferWebGL2]);

  useEffect(() => {
    const renderer = r.current;
    if (!renderer) return;
    latest.current.onCompile?.(renderer.setShader({ fragment: props.fragment, format: props.format, vertex: props.vertex, params: props.params }));
  }, [props.fragment, props.format, props.vertex, props.params, props.clock, preferWebGL2]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      for (let i = 0; i < 4; i++) {
        const b = props.channels?.[i];
        const src = b?.assetId ? await resolveChannel(b.assetId) : null;
        if (alive) r.current?.setChannel(i, src, b ?? undefined);
      }
    })();
    return () => {
      alive = false;
    };
  }, [props.channels, props.clock, preferWebGL2]);

  useEffect(() => {
    r.current?.requestRender();
  }, [props.values]);

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={holder} className="h-full w-full" />
      {fatal && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-white/80">{fatal} Shader Forge needs WebGL.</div>}
    </div>
  );
}
