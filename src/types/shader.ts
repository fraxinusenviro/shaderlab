/**
 * Core data model for Shader Forge. Everything persisted or exported derives
 * from ShaderProject; keep it serialisable (no functions, no typed arrays).
 */

export const SCHEMA_VERSION = 1;

/** How the user's fragment source is wrapped before compilation. */
export type ShaderFormat = 'auto' | 'shadertoy' | 'standard' | 'gltransition';
export type ResolvedFormat = Exclude<ShaderFormat, 'auto'>;

export type ParamType = 'float' | 'int' | 'bool' | 'vec2' | 'vec3' | 'vec4';
export type ParamWidget =
  | 'slider'
  | 'number'
  | 'toggle'
  | 'select'
  | 'color'
  | 'vector'
  | 'xy'
  | 'angle'
  | 'seed';

export type ParamValue = number | boolean | number[];

export interface ParamOption {
  label: string;
  value: number;
}

export interface ParamDef {
  /** Uniform name in GLSL. Stable key for values/modulations. */
  name: string;
  type: ParamType;
  label: string;
  widget: ParamWidget;
  min: number;
  max: number;
  step: number;
  default: ParamValue;
  group: string;
  options?: ParamOption[];
  description?: string;
  /** Set when the parameter was created by promoting a literal constant. */
  promoted?: { literal: string; line: number };
  /** True once the user edited min/max/step/default in the UI. */
  userOverridden?: boolean;
}

export type ModulationKind =
  | 'constant'
  | 'sine'
  | 'triangle'
  | 'saw'
  | 'square'
  | 'random'
  | 'noise'
  | 'keyframes'
  | 'expression'
  | 'link';

export interface Keyframe {
  t: number; // seconds
  v: number;
  ease?: 'linear' | 'smooth' | 'step';
}

export interface Modulation {
  kind: ModulationKind;
  enabled: boolean;
  /** Cycles per second for oscillators / steps per second for random. */
  rate: number;
  /** Fraction of the parameter range (0..1) swept around the base value. */
  depth: number;
  phase: number;
  keyframes?: Keyframe[];
  /** Loop length for keyframes (seconds). */
  duration?: number;
  expression?: string;
  /** For kind 'link': follow another parameter. */
  source?: string;
  seed?: number;
}

export type ProvenanceKind = 'preset' | 'user' | 'import' | 'mutation';

export interface Provenance {
  kind: ProvenanceKind;
  presetId?: string;
  parentId?: string;
  author?: string;
  license?: string;
  sourceUrl?: string;
  notice?: string;
  importedFrom?: string;
  importedAt?: number;
}

export type MutationLevel = 1 | 2 | 3;

export interface MutationOp {
  level: MutationLevel;
  kind: string;
  description: string;
  /** Parameter name (level 1) or source location (level 2/3). */
  target?: string;
  from?: string;
  to?: string;
}

/** A node in the mutation tree (also used for named snapshots). */
export interface MutationNode {
  id: string;
  parentId: string | null;
  name: string;
  createdAt: number;
  seed: number;
  strength: number;
  level: MutationLevel | 0;
  ops: MutationOp[];
  fragment: string;
  values: Record<string, ParamValue>;
  params: ParamDef[];
  valid: boolean;
  error?: string;
  favorite?: boolean;
  thumbnail?: string;
}

export interface Revision {
  id: string;
  createdAt: number;
  label: string;
  fragment: string;
  vertex?: string;
  values: Record<string, ParamValue>;
}

export interface ChannelBinding {
  /** 'builtin:<name>' for generated textures, or an asset id. */
  assetId: string | null;
  filter: 'linear' | 'nearest';
  wrap: 'repeat' | 'clamp' | 'mirror';
}

export interface ShaderProject {
  id: string;
  schemaVersion: number;
  name: string;
  description: string;
  tags: string[];
  category: string;
  notes: string;
  format: ShaderFormat;
  fragment: string;
  /** Optional custom vertex shader; when absent the full-screen triangle is used. */
  vertex?: string;
  /** Source exactly as it was first imported/created; never rewritten. */
  original: { fragment: string; vertex?: string };
  params: ParamDef[];
  values: Record<string, ParamValue>;
  locked: string[];
  modulations: Record<string, Modulation>;
  channels: ChannelBinding[];
  provenance: Provenance;
  history: MutationNode[];
  revisions: Revision[];
  thumbnail?: string;
  favorite: boolean;
  folderId: string | null;
  collectionIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export interface Collection {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface Asset {
  id: string;
  name: string;
  mime: string;
  blob: Blob;
  createdAt: number;
}

/** Lightweight listing record used by the library sidebar. */
export interface ProjectSummary {
  id: string;
  name: string;
  category: string;
  tags: string[];
  favorite: boolean;
  folderId: string | null;
  collectionIds: string[];
  thumbnail?: string;
  provenance: Provenance;
  updatedAt: number;
}

export interface PresetDef {
  id: string;
  name: string;
  category: string;
  theme?: 'Earth' | 'Air' | 'Fire' | 'Water' | 'Geometry';
  description: string;
  tags: string[];
  format: ShaderFormat;
  fragment: string;
  author: string;
  license: string;
  sourceUrl?: string;
  notice?: string;
  channels?: ChannelBinding[];
  modulations?: Record<string, Modulation>;
}
