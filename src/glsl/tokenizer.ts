/**
 * Small, lossless GLSL tokenizer. Concatenating every token's `text`
 * reproduces the input exactly, which lets the mutation engine and the
 * constant promoter perform structured, reversible edits instead of blind
 * string replacement.
 */

export type TokenType =
  | 'ws'
  | 'newline'
  | 'comment'
  | 'preproc'
  | 'number'
  | 'ident'
  | 'op'
  | 'punct';

export interface Token {
  type: TokenType;
  text: string;
  start: number;
  end: number;
  line: number; // 1-based
  col: number; // 1-based
}

const OPS = [
  '<<=', '>>=', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '^^',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
  '+', '-', '*', '/', '%', '<', '>', '=', '!', '~', '&', '|', '^', '?', ':',
];
const PUNCT = new Set(['(', ')', '[', ']', '{', '}', ',', ';', '.']);

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;
  let atLineStart = true;
  const n = src.length;

  const push = (type: TokenType, end: number) => {
    const text = src.slice(i, end);
    out.push({ type, text, start: i, end, line, col });
    for (let k = 0; k < text.length; k++) {
      if (text.charCodeAt(k) === 10) {
        line++;
        col = 1;
      } else col++;
    }
    i = end;
  };

  while (i < n) {
    const c = src[i];
    if (c === '\n') {
      push('newline', i + 1);
      atLineStart = true;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      let j = i + 1;
      while (j < n && ' \t\r\f\v'.includes(src[j])) j++;
      push('ws', j);
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      let j = i + 2;
      while (j < n && src[j] !== '\n') j++;
      push('comment', j);
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      push('comment', close < 0 ? n : close + 2);
      continue;
    }
    if (c === '#' && atLineStart) {
      // Preprocessor directive, honouring backslash continuations.
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\n') {
          if (src[j - 1] === '\\') {
            j++;
            continue;
          }
          break;
        }
        j++;
      }
      push('preproc', j);
      atLineStart = false;
      continue;
    }
    atLineStart = false;
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      push('number', scanNumber(src, i));
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentPart(src[j])) j++;
      push('ident', j);
      continue;
    }
    if (PUNCT.has(c)) {
      push('punct', i + 1);
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    push('op', i + (op ? op.length : 1));
  }
  return out;
}

function scanNumber(src: string, i: number): number {
  let j = i;
  const n = src.length;
  if (src[j] === '0' && (src[j + 1] === 'x' || src[j + 1] === 'X')) {
    j += 2;
    while (j < n && /[0-9a-fA-F]/.test(src[j])) j++;
  } else {
    while (j < n && isDigit(src[j])) j++;
    if (src[j] === '.') {
      j++;
      while (j < n && isDigit(src[j])) j++;
    }
    if (src[j] === 'e' || src[j] === 'E') {
      let k = j + 1;
      if (src[k] === '+' || src[k] === '-') k++;
      if (isDigit(src[k] ?? '')) {
        j = k;
        while (j < n && isDigit(src[j])) j++;
      }
    }
  }
  if (src[j] === 'u' || src[j] === 'U' || src[j] === 'f' || src[j] === 'F') j++;
  return j;
}

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isIdentPart = (c: string) => isIdentStart(c) || isDigit(c);

export function untokenize(tokens: Token[]): string {
  return tokens.map((t) => t.text).join('');
}

/** True if a numeric literal is a float (has '.', exponent or f suffix). */
export function isFloatLiteral(text: string): boolean {
  if (/^0[xX]/.test(text)) return false;
  return /[.eEfF]/.test(text);
}

/** Index of the next token that is not whitespace/comment/newline. */
export function nextSignificant(tokens: Token[], from: number): number {
  for (let k = from; k < tokens.length; k++) {
    const t = tokens[k].type;
    if (t !== 'ws' && t !== 'newline' && t !== 'comment') return k;
  }
  return -1;
}

export function prevSignificant(tokens: Token[], from: number): number {
  for (let k = from; k >= 0; k--) {
    const t = tokens[k].type;
    if (t !== 'ws' && t !== 'newline' && t !== 'comment') return k;
  }
  return -1;
}

/** Given the index of an opening bracket, find the matching closing index. */
export function matchBracket(tokens: Token[], openIdx: number): number {
  const open = tokens[openIdx].text;
  const close = open === '(' ? ')' : open === '[' ? ']' : '}';
  let depth = 0;
  for (let k = openIdx; k < tokens.length; k++) {
    if (tokens[k].type !== 'punct') continue;
    if (tokens[k].text === open) depth++;
    else if (tokens[k].text === close) {
      depth--;
      if (depth === 0) return k;
    }
  }
  return -1;
}

export const GLSL_TYPES = new Set([
  'void', 'bool', 'int', 'uint', 'float', 'double',
  'vec2', 'vec3', 'vec4', 'bvec2', 'bvec3', 'bvec4', 'ivec2', 'ivec3', 'ivec4',
  'uvec2', 'uvec3', 'uvec4', 'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4',
  'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
  'sampler2D', 'sampler3D', 'samplerCube', 'sampler2DArray',
]);

export interface FunctionInfo {
  name: string;
  returnType: string;
  /** Token index of the function name. */
  nameIdx: number;
  paramsOpen: number;
  paramsClose: number;
  bodyOpen: number;
  bodyClose: number;
  params: { qualifier: string; type: string; name: string }[];
}

/** Locate top-level function definitions (not prototypes). */
export function findFunctions(tokens: Token[]): FunctionInfo[] {
  const fns: FunctionInfo[] = [];
  let depth = 0;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type === 'punct' && t.text === '{') depth++;
    else if (t.type === 'punct' && t.text === '}') depth--;
    if (depth !== 0 || t.type !== 'ident') continue;
    const prev = prevSignificant(tokens, k - 1);
    const next = nextSignificant(tokens, k + 1);
    if (prev < 0 || next < 0) continue;
    if (tokens[next].text !== '(') continue;
    if (tokens[prev].type !== 'ident' || !GLSL_TYPES.has(tokens[prev].text) && !/^[A-Z]/.test(tokens[prev].text)) continue;
    const close = matchBracket(tokens, next);
    if (close < 0) continue;
    const body = nextSignificant(tokens, close + 1);
    if (body < 0 || tokens[body].text !== '{') continue;
    const bodyClose = matchBracket(tokens, body);
    if (bodyClose < 0) continue;
    fns.push({
      name: t.text,
      returnType: tokens[prev].text,
      nameIdx: k,
      paramsOpen: next,
      paramsClose: close,
      bodyOpen: body,
      bodyClose,
      params: parseParams(tokens.slice(next + 1, close)),
    });
    k = bodyClose; // skip body; depth stays 0
  }
  return fns;
}

function parseParams(tokens: Token[]): FunctionInfo['params'] {
  const groups: string[][] = [[]];
  for (const t of tokens) {
    if (t.type === 'punct' && t.text === ',') groups.push([]);
    else if (t.type === 'ident') groups[groups.length - 1].push(t.text);
  }
  return groups
    .filter((g) => g.length >= 2)
    .map((g) => {
      const name = g[g.length - 1];
      const type = g[g.length - 2];
      const qualifier = g.slice(0, -2).filter((q) => q === 'in' || q === 'out' || q === 'inout').join(' ') || 'in';
      return { qualifier, type, name };
    });
}

/** Strip comments (keeping line structure) — handy for regex-based detection. */
export function stripComments(src: string): string {
  return tokenize(src)
    .map((t) => (t.type === 'comment' ? t.text.replace(/[^\n]/g, ' ') : t.text))
    .join('');
}
