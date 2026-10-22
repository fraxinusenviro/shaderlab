// Lens & Prism — Shader Forge original (MIT)
// Image processing: animated lens ripple, chromatic aberration and pixelation of iChannel0.
uniform float uRipple;     // @param default=0.02 min=0 max=0.1 step=0.0005 label="Ripple strength" group=Warp
uniform float uFrequency;  // @param default=30 min=2 max=80 label="Ripple frequency" group=Shape
uniform float uAberration; // @param default=0.006 min=0 max=0.03 step=0.0001 label="Chromatic aberration" group=Colour
uniform float uPixelate;   // @param default=0 min=0 max=64 step=1 label="Pixel size" group=Shape
uniform float uVignette;   // @param default=0.6 min=0 max=1.5 label="Vignette" group=Colour
uniform float uSpeed;      // @param default=2.0 min=-8 max=8 label="Ripple speed" group=Animation

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 fc = fragCoord;
  if (uPixelate >= 1.0) fc = (floor(fc / uPixelate) + 0.5) * uPixelate;
  vec2 uv = fc / iResolution.xy;
  vec2 c = iMouse.z > 0.0 ? iMouse.xy / iResolution.xy : vec2(0.5);
  vec2 d = uv - c;
  float r = length(d * vec2(iResolution.x / iResolution.y, 1.0));
  vec2 dir = r > 0.0 ? d / max(length(d), 1e-4) : vec2(0.0);
  uv += dir * sin(r * uFrequency - iTime * uSpeed) * uRipple * exp(-r * 2.0);
  vec3 col;
  col.r = texture(iChannel0, uv + dir * uAberration).r;
  col.g = texture(iChannel0, uv).g;
  col.b = texture(iChannel0, uv - dir * uAberration).b;
  col *= 1.0 - uVignette * r * r;
  fragColor = vec4(col, 1.0);
}
