/**
 * Literal-constant discovery and reversible promotion to uniforms.
 *
 * Not every literal is safe to turn into a uniform: values inside loop
 * headers, array sizes, const declarations, global initialisers and
 * preprocessor directives must stay compile-time constants in GLSL ES, and
 * integer literals frequently index or count. Those are never offered.
 * Remaining float literals are classified "safe" or "caution".
 */
import { isFloatLiteral, nextSignificant, prevSignificant, tokenize, type Token } from '../glsl/tokenizer';

export interface ConstantCandidate {
  index: number; // token index
  start: number;
  end: number;
  text: string;
  value: number;
  line: number;
  col: number;
  fn: string | null;
  safety: 'safe' | 'caution';
  reason?: string;
  lineText: string;
}

export function findConstantCandidates(source: string): ConstantCandidate[] {
  const tokens = tokenize(source);
  const lines = source.split('\n');
  const out: ConstantCandidate[] = [];

  let depth = 0; // brace depth
  let currentFn: string | null = null;
  const parenStack: { forHeader: boolean }[] = [];
  let bracketDepth = 0;
  let stmtHasConst = false;
  let pendingFnName: string | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'punct') {
      if (t.text === '{') {
        if (depth === 0) currentFn = pendingFnName;
        depth++;
        stmtHasConst = false;
      } else if (t.text === '}') {
        depth--;
        if (depth === 0) currentFn = null;
        stmtHasConst = false;
      } else if (t.text === ';') {
        stmtHasConst = false;
      } else if (t.text === '(') {
        const prev = prevSignificant(tokens, i - 1);
        const isFor = prev >= 0 && tokens[prev].text === 'for';
        if (depth === 0 && prev >= 0 && tokens[prev].type === 'ident') pendingFnName = tokens[prev].text;
        parenStack.push({ forHeader: isFor || (parenStack.length > 0 && parenStack[parenStack.length - 1].forHeader) });
      } else if (t.text === ')') {
        parenStack.pop();
      } else if (t.text === '[') bracketDepth++;
      else if (t.text === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (t.type === 'ident') {
      if (t.text === 'const') stmtHasConst = true;
      continue;
    }
    if (t.type !== 'number') continue;
    if (!isFloatLiteral(t.text)) continue;
    if (depth === 0) continue; // global initialisers must be constant
    if (stmtHasConst) continue;
    if (bracketDepth > 0) continue;
    if (parenStack.length && parenStack[parenStack.length - 1].forHeader) continue;

    const value = parseFloat(t.text.replace(/[fF]$/, ''));
    if (!Number.isFinite(value)) continue;
    let safety: ConstantCandidate['safety'] = 'safe';
    let reason: string | undefined;
    const prev = prevSignificant(tokens, i - 1);
    const next = nextSignificant(tokens, i + 1);
    if (value === 0 || value === 1) {
      safety = 'caution';
      reason = 'Identity value (0 or 1) — often structural.';
    }
    if (prev >= 0 && next >= 0 && tokens[prev].text === '(' && /^vec[234]$/.test(prevIdentBefore(tokens, prev) ?? '') && value <= 1 && value >= 0) {
      safety = 'caution';
      reason = reason ?? 'Inside a vector constructor — may be a colour or alpha component.';
    }
    if (prev >= 0 && (tokens[prev].text === 'return')) {
      safety = 'caution';
      reason = 'Directly returned value.';
    }
    out.push({
      index: i,
      start: t.start,
      end: t.end,
      text: t.text,
      value,
      line: t.line,
      col: t.col,
      fn: currentFn,
      safety,
      reason,
      lineText: lines[t.line - 1] ?? '',
    });
  }
  return out;
}

function prevIdentBefore(tokens: Token[], idx: number): string | null {
  const p = prevSignificant(tokens, idx - 1);
  return p >= 0 && tokens[p].type === 'ident' ? tokens[p].text : null;
}

/** Line index (0-based) after which promoted uniform declarations go. */
export function declarationInsertLine(source: string): number {
  const lines = source.split('\n');
  let insertAfter = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*#\s*(version|extension)\b/.test(l) || /^\s*precision\s+\w+\s+\w+\s*;/.test(l)) insertAfter = i;
    // Stop at the first function body; precision statements after that are unusual.
    if (/\{/.test(l) && !/^\s*\/\//.test(l)) break;
  }
  return insertAfter + 1;
}

export function nextPromotedName(source: string): string {
  let k = 1;
  while (new RegExp(`\\bu_k${k}\\b`).test(source)) k++;
  return `u_k${k}`;
}

export function suggestRange(value: number): { min: number; max: number } {
  if (value > 0) return { min: 0, max: Number((value * 2).toPrecision(4)) };
  if (value < 0) return { min: Number((value * 2).toPrecision(4)), max: 0 };
  return { min: -1, max: 1 };
}

export interface PromoteResult {
  source: string;
  name: string;
}

/**
 * Replace a single literal with a new uniform and insert its annotated
 * declaration. The annotation records the original literal so the
 * transformation can be reversed exactly by demoteConstant().
 */
export function promoteConstant(source: string, candidate: Pick<ConstantCandidate, 'start' | 'end' | 'text' | 'value' | 'line'>, name?: string, label?: string): PromoteResult {
  if (source.slice(candidate.start, candidate.end) !== candidate.text) {
    throw new Error('Source changed since constants were scanned; rescan and try again.');
  }
  const uname = name ?? nextPromotedName(source);
  const replaced = source.slice(0, candidate.start) + uname + source.slice(candidate.end);
  const { min, max } = suggestRange(candidate.value);
  const decl = `uniform float ${uname}; // @param default=${candidate.text.replace(/[fF]$/, '')} min=${min} max=${max} group=Promoted label="${label ?? `${uname} (line ${candidate.line})`}" promoted="${candidate.text}"`;
  const lines = replaced.split('\n');
  lines.splice(declarationInsertLine(replaced), 0, decl);
  return { source: lines.join('\n'), name: uname };
}

/**
 * Remove a promoted uniform: delete its declaration and substitute every
 * reference with either the original literal or a baked replacement value.
 */
export function demoteConstant(source: string, name: string, bakeLiteral?: string): string {
  const lines = source.split('\n');
  const declRe = new RegExp(`^\\s*uniform\\s+float\\s+${name}\\s*;.*promoted="([^"]*)"`);
  const idx = lines.findIndex((l) => declRe.test(l));
  if (idx < 0) throw new Error(`"${name}" is not a promoted constant.`);
  const literal = bakeLiteral ?? declRe.exec(lines[idx])![1];
  lines.splice(idx, 1);
  const without = lines.join('\n');
  return tokenize(without)
    .map((t) => (t.type === 'ident' && t.text === name ? literal : t.text))
    .join('');
}
