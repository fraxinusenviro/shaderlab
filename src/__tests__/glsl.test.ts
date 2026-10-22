import { describe, expect, it } from 'vitest';
import { adaptShader, detectFormat, parseShaderLog, upgradeToEssl3 } from '../glsl/adapter';
import { findFunctions, isFloatLiteral, tokenize, untokenize } from '../glsl/tokenizer';

const TOY = `uniform float uFreq; // @param min=0 max=20
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime * uFreq), 1.0);
}
`;

describe('tokenizer', () => {
  it('is lossless', () => {
    const src = `#version 300 es\n// c\n/* block\n */ float x = 1.5e-3 + .5 - 2.0f; vec2 a = vec2(0x1F);\n#define F(x) (x*2.0) \\\n  + 1.0\n`;
    expect(untokenize(tokenize(src))).toBe(src);
  });
  it('classifies numbers and preprocessor lines', () => {
    const toks = tokenize('#define K 3.0\nfloat x = 3.0 + 2;');
    expect(toks[0].type).toBe('preproc');
    const nums = toks.filter((t) => t.type === 'number').map((t) => t.text);
    expect(nums).toEqual(['3.0', '2']);
    expect(isFloatLiteral('3.0')).toBe(true);
    expect(isFloatLiteral('2')).toBe(false);
    expect(isFloatLiteral('1e3')).toBe(true);
  });
  it('finds function definitions and parameters', () => {
    const fns = findFunctions(tokenize(TOY));
    expect(fns.map((f) => f.name)).toEqual(['mainImage']);
    expect(fns[0].params).toEqual([
      { qualifier: 'out', type: 'vec4', name: 'fragColor' },
      { qualifier: 'in', type: 'vec2', name: 'fragCoord' },
    ]);
  });
});

describe('format detection & adapter', () => {
  it('detects formats', () => {
    expect(detectFormat(TOY)).toBe('shadertoy');
    expect(detectFormat('void main(){ gl_FragColor = vec4(1.0); }')).toBe('standard');
    expect(detectFormat('vec4 transition(vec2 uv){ return getFromColor(uv); }')).toBe('gltransition');
    // A comment mentioning mainImage must not confuse detection.
    expect(detectFormat('// mainImage\nvoid main(){}')).toBe('standard');
  });

  it('wraps Shadertoy code for WebGL2 without touching the user source', () => {
    const r = adaptShader(TOY, { format: 'auto', glVersion: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.glsl).toBe('300');
    expect(r.fragment.startsWith('#version 300 es\n')).toBe(true);
    expect(r.fragment).toContain('uniform float iTime;');
    expect(r.fragment).toContain('mainImage(c, gl_FragCoord.xy)');
    // User line 1 sits exactly userLineOffset lines down.
    const lines = r.fragment.split('\n');
    expect(lines[r.userLineOffset]).toBe(TOY.split('\n')[0]);
  });

  it('does not redeclare uniforms the user already declared', () => {
    const src = 'uniform float iTime;\n' + TOY;
    const r = adaptShader(src, { format: 'shadertoy', glVersion: 2 });
    expect(r.ok && r.fragment.match(/uniform float iTime;/g)?.length).toBe(1);
  });

  it('targets GLSL ES 1.00 under WebGL1 and maps texture()', () => {
    const r = adaptShader(TOY, { format: 'auto', glVersion: 1 });
    expect(r.ok && r.glsl).toBe('100');
    expect(r.ok && r.fragment).toContain('#define texture texture2D');
  });

  it('explains GLSL ES 3.00 shaders under WebGL1 instead of failing obscurely', () => {
    const r = adaptShader('#version 300 es\nprecision highp float; out vec4 o; void main(){ o = vec4(1.0); }', { format: 'auto', glVersion: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/WebGL 2/);
  });

  it('hoists #version and keeps line numbering for user code', () => {
    const src = '#version 300 es\nprecision highp float;\nout vec4 o;\nvoid main(){ o = vec4(1.0); }\n';
    const r = adaptShader(src, { format: 'standard', glVersion: 2 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lines = r.fragment.split('\n');
    expect(lines[0]).toBe('#version 300 es');
    expect(lines[r.userLineOffset + 3]).toBe('void main(){ o = vec4(1.0); }');
  });

  it('upgrades ES 1.00 derivative shaders to ES 3.00 on WebGL2', () => {
    const src = 'precision highp float;\nvoid main(){ float w = fwidth(gl_FragCoord.x); gl_FragColor = texture2D(s, vec2(w)); }';
    expect(upgradeToEssl3(src)).toContain('sf_FragColor = texture(s');
    const r = adaptShader(src, { format: 'standard', glVersion: 2 });
    expect(r.ok && r.glsl).toBe('300');
  });

  it('rejects Shadertoy code without mainImage and standard code without main', () => {
    expect(adaptShader('float f(){return 1.0;}', { format: 'shadertoy', glVersion: 2 }).ok).toBe(false);
    expect(adaptShader('float f(){return 1.0;}', { format: 'standard', glVersion: 2 }).ok).toBe(false);
  });
});

describe('diagnostics', () => {
  it('maps compiler lines to user lines and flags wrapper errors', () => {
    const log = "ERROR: 0:12: 'foo' : undeclared identifier\nERROR: 0:2: 'bar' : syntax error\nERROR: 0:40: 'x' : wrapper problem\n";
    const d = parseShaderLog(log, 'fragment', 10, 20);
    expect(d[0]).toMatchObject({ line: 2, origin: 'user', severity: 'error' });
    expect(d[1]).toMatchObject({ line: null, origin: 'wrapper' });
    expect(d[2]).toMatchObject({ line: null, origin: 'wrapper' });
  });
});
