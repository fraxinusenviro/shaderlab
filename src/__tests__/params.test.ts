import { describe, expect, it } from 'vitest';
import { demoteConstant, findConstantCandidates, promoteConstant } from '../params/constants';
import { deriveParams, glslLiteral, mergeParams, parseAnnotation, parseParams } from '../params/parse';

describe('annotation parsing', () => {
  it('parses key=value and quoted values', () => {
    expect(parseAnnotation(' min=0 max=20 label="Freq Hz" widget=slider')).toEqual({ attrs: { min: '0', max: '20', label: 'Freq Hz', widget: 'slider' }, free: '' });
  });

  it('builds parameter definitions from uniforms', () => {
    const defs = parseParams(`
uniform float uFreq; // @param min=0 max=20 step=0.5 default=5 label="Frequency" group=Shape
// @param widget=color default=1,0.5,0.25
uniform vec3 uTint;
uniform int uMode; // @param options="Circles:0,Squares:1"
uniform bool uOn; // @param default=true
uniform float iTime;
uniform sampler2D tex;
uniform float uSpeed;
`);
    expect(defs.map((d) => d.name)).toEqual(['uFreq', 'uTint', 'uMode', 'uOn', 'uSpeed']);
    expect(defs[0]).toMatchObject({ min: 0, max: 20, step: 0.5, default: 5, label: 'Frequency', group: 'Shape', widget: 'slider' });
    expect(defs[1]).toMatchObject({ widget: 'color', default: [1, 0.5, 0.25] });
    expect(defs[2].widget).toBe('select');
    expect(defs[2].options).toEqual([
      { label: 'Circles', value: 0 },
      { label: 'Squares', value: 1 },
    ]);
    expect(defs[3]).toMatchObject({ widget: 'toggle', default: true });
    expect(defs[4]).toMatchObject({ group: 'Animation', default: 1 }); // inferred from name
  });

  it('reads GL Transitions default syntax and adds a progress parameter', () => {
    const src = '// @param Frequency of the ripples\nuniform float amplitude; // = 100.0\nuniform bool opening; // = true\nvec4 transition(vec2 uv){ return getFromColor(uv); }';
    const defs = deriveParams(src, 'auto');
    expect(defs[0].name).toBe('progress');
    const amp = defs.find((d) => d.name === 'amplitude')!;
    expect(amp.default).toBe(100);
    expect(amp.max).toBeGreaterThanOrEqual(100);
    expect(amp.description).toBe('Frequency of the ripples');
    expect(defs.find((d) => d.name === 'opening')!.default).toBe(true);
  });

  it('merges while preserving values and user range overrides', () => {
    const a = parseParams('uniform float uA; // @param min=0 max=1\nuniform vec2 uB;');
    const prev = a.map((d) => (d.name === 'uA' ? { ...d, max: 5, userOverridden: true } : d));
    const b = parseParams('uniform float uA; // @param min=0 max=1\nuniform float uB;');
    const merged = mergeParams(b, prev, { uA: 3, uB: [0.1, 0.2] });
    expect(merged.params[0].max).toBe(5);
    expect(merged.values.uA).toBe(3);
    expect(merged.values.uB).toBe(b[1].default); // type changed → default
  });

  it('formats GLSL literals', () => {
    const [f, v] = parseParams('uniform float a;\nuniform vec3 b;');
    expect(glslLiteral(f, 2)).toBe('2.0');
    expect(glslLiteral(v, [1, 0.5, 0])).toBe('vec3(1.0, 0.5, 0.0)');
  });
});

describe('constant promotion', () => {
  const SRC = `precision highp float;
const float PI = 3.14159;
float g = 2.0;
uniform float uX;
float wave(float x) {
  float arr[4];
  for (int i = 0; i < 4; i++) { x += 0.5; }
  return sin(x * 6.5) * 0.25 + arr[2];
}
void main() { gl_FragColor = vec4(wave(1.75), 0.0, 0.0, 1.0); }
`;
  it('excludes unsafe literals', () => {
    const c = findConstantCandidates(SRC);
    const texts = c.map((x) => x.text);
    expect(texts).not.toContain('3.14159'); // const
    expect(texts).not.toContain('2.0'); // global initialiser
    expect(texts).not.toContain('4'); // integers / array size / loop bound
    expect(texts).toEqual(expect.arrayContaining(['0.5', '6.5', '0.25', '1.75']));
    expect(c.find((x) => x.text === '6.5')!.safety).toBe('safe');
    expect(c.find((x) => x.text === '0.0')!.safety).toBe('caution');
  });

  it('promotes and demotes reversibly', () => {
    const cand = findConstantCandidates(SRC).find((x) => x.text === '6.5')!;
    const { source, name } = promoteConstant(SRC, cand);
    expect(name).toBe('u_k1');
    expect(source).toContain('sin(x * u_k1)');
    expect(source.split('\n')[1]).toMatch(/^uniform float u_k1; \/\/ @param default=6.5 .*promoted="6.5"/);
    const defs = parseParams(source);
    expect(defs.find((d) => d.name === 'u_k1')).toMatchObject({ default: 6.5, min: 0, max: 13, promoted: { literal: '6.5' } });
    expect(demoteConstant(source, name)).toBe(SRC);
    expect(demoteConstant(source, name, '7.25')).toBe(SRC.replace('x * 6.5', 'x * 7.25'));
  });

  it('refuses stale candidates', () => {
    const cand = findConstantCandidates(SRC).find((x) => x.text === '6.5')!;
    expect(() => promoteConstant(SRC.replace('6.5', '6.6'), cand)).toThrow();
  });
});
