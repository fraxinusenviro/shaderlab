/**
 * Safe arithmetic expression compiler for time-based modulation, e.g.
 *   base + 0.5 * sin(t * 2.0) * (max - min)
 * Parses into an AST and evaluates it with a fixed whitelist of functions
 * and variables. No eval(), no Function(), no property access.
 */

type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  fract: (x) => x - Math.floor(x),
  sqrt: Math.sqrt,
  exp: Math.exp,
  log: Math.log,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  sign: Math.sign,
  mod: (a, b) => a - b * Math.floor(a / b),
  clamp: (x, a, b) => Math.min(b, Math.max(a, x)),
  mix: (a, b, t) => a + (b - a) * t,
  step: (e, x) => (x < e ? 0 : 1),
  smoothstep: (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  },
  noise: (x) => valueNoise1(x),
  hash: (x) => hash1(x),
};

export const EXPR_VARIABLES = ['t', 'time', 'base', 'min', 'max', 'pi', 'tau', 'e'];

export function hash1(x: number): number {
  const s = Math.sin(x * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function valueNoise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}

class Parser {
  private i = 0;
  private toks: string[];
  constructor(src: string) {
    this.toks = src.match(/\d*\.?\d+(?:[eE][+-]?\d+)?|[A-Za-z_]\w*|\*\*|[-+*/%^(),]|\S/g) ?? [];
  }
  private peek() {
    return this.toks[this.i];
  }
  private next() {
    return this.toks[this.i++];
  }
  private expect(t: string) {
    if (this.next() !== t) throw new Error(`Expected "${t}"`);
  }
  parse(): Node {
    const n = this.add();
    if (this.i < this.toks.length) throw new Error(`Unexpected "${this.peek()}"`);
    return n;
  }
  private add(): Node {
    let a = this.mul();
    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.next();
      a = { k: 'bin', op, a, b: this.mul() };
    }
    return a;
  }
  private mul(): Node {
    let a = this.unary();
    while (this.peek() === '*' || this.peek() === '/' || this.peek() === '%') {
      const op = this.next();
      a = { k: 'bin', op, a, b: this.unary() };
    }
    return a;
  }
  private unary(): Node {
    if (this.peek() === '-' || this.peek() === '+') {
      const op = this.next();
      return { k: 'un', op, a: this.unary() };
    }
    return this.pow();
  }
  private pow(): Node {
    const a = this.atom();
    if (this.peek() === '^' || this.peek() === '**') {
      this.next();
      return { k: 'bin', op: '^', a, b: this.unary() };
    }
    return a;
  }
  private atom(): Node {
    const t = this.next();
    if (t === undefined) throw new Error('Unexpected end of expression');
    if (t === '(') {
      const n = this.add();
      this.expect(')');
      return n;
    }
    if (/^\d|^\./.test(t)) return { k: 'num', v: parseFloat(t) };
    if (/^[A-Za-z_]/.test(t)) {
      if (this.peek() === '(') {
        if (!(t in FUNCS)) throw new Error(`Unknown function "${t}"`);
        this.next();
        const args: Node[] = [];
        if (this.peek() !== ')') {
          args.push(this.add());
          while (this.peek() === ',') {
            this.next();
            args.push(this.add());
          }
        }
        this.expect(')');
        return { k: 'call', fn: t, args };
      }
      if (!EXPR_VARIABLES.includes(t)) throw new Error(`Unknown variable "${t}"`);
      return { k: 'var', name: t };
    }
    throw new Error(`Unexpected "${t}"`);
  }
}

export type Scope = { t: number; base: number; min: number; max: number };

function evaluate(n: Node, s: Scope): number {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'var':
      switch (n.name) {
        case 't':
        case 'time':
          return s.t;
        case 'pi':
          return Math.PI;
        case 'tau':
          return Math.PI * 2;
        case 'e':
          return Math.E;
        default:
          return s[n.name as 'base' | 'min' | 'max'];
      }
    case 'un':
      return n.op === '-' ? -evaluate(n.a, s) : evaluate(n.a, s);
    case 'bin': {
      const a = evaluate(n.a, s);
      const b = evaluate(n.b, s);
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '%':
          return a - b * Math.floor(a / b);
        default:
          return Math.pow(a, b);
      }
    }
    case 'call':
      return FUNCS[n.fn](...n.args.map((x) => evaluate(x, s)));
  }
}

export interface CompiledExpr {
  (scope: Scope): number;
}

const cache = new Map<string, CompiledExpr | Error>();

export function compileExpression(src: string): CompiledExpr {
  const hit = cache.get(src);
  if (hit instanceof Error) throw hit;
  if (hit) return hit;
  try {
    const ast = new Parser(src).parse();
    const fn: CompiledExpr = (scope) => {
      const v = evaluate(ast, scope);
      return Number.isFinite(v) ? v : 0;
    };
    cache.set(src, fn);
    return fn;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    cache.set(src, err);
    throw err;
  }
}

export function validateExpression(src: string): string | null {
  try {
    compileExpression(src);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
