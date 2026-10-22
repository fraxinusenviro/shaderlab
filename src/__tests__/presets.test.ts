import { describe, expect, it } from 'vitest';
import { detectFormat } from '../glsl/adapter';
import { deriveParams } from '../params/parse';
import { PRESETS, THEMES } from '../presets/catalog';
import { TEMPLATES } from '../presets/templates';

describe('preset catalogue', () => {
  it('has a curated set with unique ids', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
  it.each(PRESETS.map((p) => [p.id, p] as const))('%s has licence, attribution and parameters', (_id, p) => {
    expect(p.fragment.trim().length).toBeGreaterThan(50);
    expect(p.license).toBeTruthy();
    expect(p.author).toBeTruthy();
    expect(detectFormat(p.fragment)).toBe(p.format);
    expect(deriveParams(p.fragment, p.format).length).toBeGreaterThan(0);
    if (p.author !== 'Shader Forge contributors') {
      expect(p.sourceUrl).toMatch(/^https:\/\//);
      expect(p.notice).toContain('Permission is hereby granted');
    }
  });
  it('covers every theme', () => {
    for (const t of THEMES) expect(PRESETS.some((p) => p.theme === t)).toBe(true);
  });
  it('templates parse', () => {
    for (const t of TEMPLATES) expect(detectFormat(t.fragment)).toBe(t.format === 'auto' ? detectFormat(t.fragment) : t.format);
  });
});
