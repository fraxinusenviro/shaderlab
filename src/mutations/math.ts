/**
 * Level 2 — mathematical mutation. Works on the token stream rather than
 * raw strings: only float literals that are legal to change at runtime
 * (see findConstantCandidates) are perturbed, function calls are located
 * by bracket matching, and time references are rescaled consistently.
 * Results must still be compile-validated by the caller.
 */
import { findConstantCandidates } from '../params/constants';
import { findFunctions, matchBracket, nextSignificant, prevSignificant, tokenize, type Token } from '../glsl/tokenizer';
import type { MutationOp } from '../types/shader';
import { createRng } from './rng';

export type MathOpKind = 'literals' | 'frequency' | 'trig-swap' | 'time-scale' | 'time-reverse' | 'fn-swap';

export const MATH_OPS: { id: MathOpKind; label: string }[] = [
  { id: 'literals', label: 'Perturb numeric constants' },
  { id: 'frequency', label: 'Scale trig frequencies' },
  { id: 'trig-swap', label: 'Swap sin ↔ cos (phase)' },
  { id: 'fn-swap', label: 'Swap floor ↔ ceil, min ↔ max' },
  { id: 'time-scale', label: 'Change animation speed' },
  { id: 'time-reverse', label: 'Reverse animation direction' },
];

export interface MathMutationOptions {
  seed: number;
  strength: number;
  probability: number;
  ops: MathOpKind[];
}

export const TIME_IDENTS = ['iTime', 'time', 'u_time', 'uTime'];

export function formatFloat(x: number): string {
  if (!Number.isFinite(x)) return '0.0';
  let s = Number(x.toPrecision(5)).toString();
  if (/e/.test(s)) s = x.toFixed(6);
  return /\./.test(s) ? s : s + '.0';
}

/** Identifiers that are declarations (uniform float iTime;), not uses. */
function isDeclaration(tokens: Token[], i: number): boolean {
  const p = prevSignificant(tokens, i - 1);
  if (p < 0) return false;
  const pt = tokens[p];
  return pt.type === 'ident' && /^(float|int|vec[234]|uniform|highp|mediump|lowp)$/.test(pt.text);
}

export function mutateMath(source: string, opts: MathMutationOptions): { source: string; ops: MutationOp[] } {
  const rng = createRng(opts.seed);
  const ops: MutationOp[] = [];
  const tokens = tokenize(source);
  const replace = new Map<number, string>(); // token index -> new text
  const insertBefore = new Map<number, string>();
  const insertAfter = new Map<number, string>();
  const enabled = new Set(opts.ops);
  const s = Math.max(0, Math.min(1, opts.strength));

  if (enabled.has('literals')) {
    const cands = findConstantCandidates(source).filter((c) => c.safety === 'safe');
    for (const c of cands) {
      if (!rng.chance(opts.probability * 0.6)) continue;
      const factor = Math.exp(rng.gauss() * s * 0.6);
      const nv = c.value * factor;
      const text = formatFloat(nv);
      if (text === c.text) continue;
      replace.set(c.index, text);
      ops.push({ level: 2, kind: 'literal', description: `L${c.line}: ${c.text} → ${text}`, target: `${c.line}:${c.col}`, from: c.text, to: text });
    }
  }

  const fnBodies = findFunctions(tokens);
  const inBody = (i: number) => fnBodies.some((f) => i > f.bodyOpen && i < f.bodyClose);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'ident' || !inBody(i)) continue;
    const next = nextSignificant(tokens, i + 1);
    const isCall = next >= 0 && tokens[next].text === '(';
    if (isCall && (t.text === 'sin' || t.text === 'cos')) {
      if (enabled.has('trig-swap') && rng.chance(opts.probability * 0.25 * (0.5 + s))) {
        const to = t.text === 'sin' ? 'cos' : 'sin';
        replace.set(i, to);
        ops.push({ level: 2, kind: 'trig-swap', description: `L${t.line}: ${t.text}() → ${to}()`, target: `${t.line}:${t.col}`, from: t.text, to });
      }
      if (enabled.has('frequency') && rng.chance(opts.probability * 0.4)) {
        const close = matchBracket(tokens, next);
        if (close > next + 1) {
          const k = formatFloat(Math.exp(rng.gauss() * s * 0.5));
          insertAfter.set(next, `${insertAfter.get(next) ?? ''}(`);
          insertBefore.set(close, `)*${k}${insertBefore.get(close) ?? ''}`);
          ops.push({ level: 2, kind: 'frequency', description: `L${t.line}: ${t.text}(x) → ${t.text}((x)*${k})`, target: `${t.line}:${t.col}`, to: k });
        }
      }
    }
    if (isCall && enabled.has('fn-swap') && ['floor', 'ceil', 'min', 'max'].includes(t.text) && rng.chance(opts.probability * 0.15 * (0.5 + s))) {
      const to = { floor: 'ceil', ceil: 'floor', min: 'max', max: 'min' }[t.text]!;
      replace.set(i, to);
      ops.push({ level: 2, kind: 'fn-swap', description: `L${t.line}: ${t.text}() → ${to}()`, target: `${t.line}:${t.col}`, from: t.text, to });
    }
  }

  if (enabled.has('time-scale') || enabled.has('time-reverse')) {
    let k = 1;
    if (enabled.has('time-scale') && rng.chance(Math.max(0.3, opts.probability))) k *= Math.exp(rng.gauss() * s * 0.7);
    if (enabled.has('time-reverse') && rng.chance(0.5)) k = -k;
    if (Math.abs(k - 1) > 1e-3) {
      const kt = formatFloat(k);
      let count = 0;
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type === 'ident' && TIME_IDENTS.includes(t.text) && inBody(i) && !isDeclaration(tokens, i)) {
          replace.set(i, `(${t.text}*${kt})`);
          count++;
        }
      }
      if (count) ops.push({ level: 2, kind: k < 0 ? 'time-reverse' : 'time-scale', description: `Animation time ×${kt} (${count} references)`, to: kt });
    }
  }

  const out = tokens
    .map((t, i) => (insertBefore.get(i) ?? '') + (replace.get(i) ?? t.text) + (insertAfter.get(i) ?? ''))
    .join('');
  return { source: out, ops };
}
