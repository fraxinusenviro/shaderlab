// SDF Sculpture — Shader Forge original (MIT)
// Raymarched signed-distance sculpture: smooth-blended torus and spheres with soft shadows.
uniform float uBlend;      // @param default=0.35 min=0.01 max=1 label="Smooth blend" group=Shape
uniform float uTwist;      // @param default=0.6 min=-3 max=3 label="Twist" group=Warp
uniform float uOrbit;      // @param default=0.6 min=-2 max=2 label="Orbit speed" group=Animation
uniform float uCamDist;    // @param default=4.5 min=2.5 max=9 label="Camera distance" group=View
uniform vec3 uMaterial;    // @param widget=color default=0.85,0.45,0.3 label="Material" group=Colour
uniform vec3 uBackground;  // @param widget=color default=0.08,0.09,0.12 label="Background" group=Colour

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float map(vec3 p) {
  vec3 q = p;
  q.xz *= rot(q.y * uTwist);
  vec2 t = vec2(length(q.xz) - 1.0, q.y);
  float torus = length(t) - 0.28;
  float s1 = length(p - vec3(sin(iTime) * 0.9, 0.4 * cos(iTime * 1.3), 0.0)) - 0.45;
  float s2 = length(p - vec3(0.0, cos(iTime * 0.7) * 0.8, sin(iTime * 0.9) * 0.6)) - 0.35;
  float floorD = p.y + 1.2;
  return min(smin(smin(torus, s1, uBlend), s2, uBlend), floorD);
}
vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}
float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.02;
  for (int i = 0; i < 32; i++) {
    float h = map(ro + rd * t);
    res = min(res, 8.0 * h / t);
    t += clamp(h, 0.02, 0.2);
    if (res < 0.01 || t > 8.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float a = iTime * uOrbit * 0.3 + (iMouse.z > 0.0 ? iMouse.x / iResolution.x * 6.28 : 0.0);
  vec3 ro = vec3(uCamDist * sin(a), 1.2, uCamDist * cos(a));
  vec3 fw = normalize(-ro), rt = normalize(cross(fw, vec3(0, 1, 0))), up = cross(rt, fw);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.6 * fw);
  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 100; i++) {
    float d = map(ro + rd * t);
    if (d < 0.001) { hit = 1.0; break; }
    t += d;
    if (t > 20.0) break;
  }
  vec3 col = uBackground + 0.05 * uv.y;
  if (hit > 0.5) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 l = normalize(vec3(0.6, 0.8, 0.4));
    float diff = max(dot(n, l), 0.0) * softShadow(p + n * 0.01, l);
    float spec = pow(max(dot(reflect(-l, n), -rd), 0.0), 32.0);
    vec3 mat = p.y < -1.19 ? vec3(0.3) * (0.5 + 0.5 * mod(floor(p.x) + floor(p.z), 2.0)) : uMaterial;
    col = mat * (0.15 + 0.85 * diff) + spec * 0.5 * diff;
    col = mix(col, uBackground, 1.0 - exp(-0.02 * t * t));
  }
  fragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}
