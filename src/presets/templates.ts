/** Starting points for File → New. */
import type { ShaderFormat } from '../types/shader';

export interface Template {
  id: string;
  name: string;
  description: string;
  format: ShaderFormat;
  fragment: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'shadertoy',
    name: 'Shadertoy (mainImage)',
    description: 'iTime, iResolution, iMouse and iChannel0–3 are provided automatically.',
    format: 'shadertoy',
    fragment: `// New Shadertoy-style shader
uniform float uScale;   // @param default=3.0 min=0.5 max=10 label="Scale"
uniform vec3 uColor;    // @param widget=color default=0.2,0.6,1.0 label="Colour"

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float d = length(uv) * uScale;
  vec3 col = uColor * (0.5 + 0.5 * cos(d * 6.2831 - iTime * 2.0));
  fragColor = vec4(col, 1.0);
}
`,
  },
  {
    id: 'standard100',
    name: 'WebGL fragment (GLSL ES 1.00)',
    description: 'Conventional main() with gl_FragColor. Declare u_time / u_resolution / u_mouse yourself.',
    format: 'standard',
    fragment: `precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform float uSpeed; // @param default=1.0 min=0 max=4 label="Speed"

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 col = 0.5 + 0.5 * cos(u_time * uSpeed + uv.xyx + vec3(0.0, 2.0, 4.0));
  gl_FragColor = vec4(col, 1.0);
}
`,
  },
  {
    id: 'standard300',
    name: 'WebGL 2 fragment (GLSL ES 3.00)',
    description: '#version 300 es with an explicit out variable.',
    format: 'standard',
    fragment: `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float uRings; // @param default=8 min=1 max=40 label="Rings"
out vec4 outColor;

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  float v = sin(length(p) * uRings * 6.2831 - u_time * 2.0);
  outColor = vec4(vec3(0.5 + 0.5 * v), 1.0);
}
`,
  },
  {
    id: 'raymarch',
    name: 'Ray-marching starter',
    description: 'Camera, SDF scene, normals and diffuse lighting.',
    format: 'shadertoy',
    fragment: `uniform float uRadius; // @param default=1.0 min=0.2 max=2 label="Sphere radius"
uniform vec3 uAlbedo;  // @param widget=color default=0.9,0.5,0.3 label="Albedo"

float map(vec3 p) {
  return min(length(p) - uRadius, p.y + 1.0);
}
vec3 normal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 ro = vec3(3.0 * sin(iTime * 0.3), 1.0, 3.0 * cos(iTime * 0.3));
  vec3 fw = normalize(-ro), rt = normalize(cross(fw, vec3(0, 1, 0))), up = cross(rt, fw);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.5 * fw);
  float t = 0.0;
  for (int i = 0; i < 96; i++) {
    float d = map(ro + rd * t);
    if (d < 0.001 || t > 20.0) break;
    t += d;
  }
  vec3 col = vec3(0.05);
  if (t < 20.0) {
    vec3 n = normal(ro + rd * t);
    col = uAlbedo * (0.2 + max(dot(n, normalize(vec3(0.5, 0.8, 0.3))), 0.0));
  }
  fragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}
`,
  },
  {
    id: 'gltransition',
    name: 'GL Transition',
    description: 'Implement vec4 transition(vec2 uv) using getFromColor/getToColor and progress.',
    format: 'gltransition',
    fragment: `// Transition between iChannel0 (from) and iChannel1 (to).
uniform float smoothness; // = 0.2

vec4 transition(vec2 uv) {
  float m = smoothstep(progress - smoothness, progress + smoothness, uv.x);
  return mix(getToColor(uv), getFromColor(uv), m);
}
`,
  },
];
