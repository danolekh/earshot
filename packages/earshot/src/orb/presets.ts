/* The orb: one sphere of sky behind glass. Its silhouette is an exact circle that only ever
 * scales; everything else lives inside it.
 * - Clouds: domain-warped noise sampled on the sphere's own surface (a normal from the disc) and
 *   turned slowly, so they wrap round it like weather on a globe; a vertical sky ramp from the
 *   palette's top, middle and deep colours; the limb a touch darker.
 * - Glass: the interior is seen through a dome-shaped lens, the displacement field from Aave's
 *   "Building Glass for the Web" (a spherical cap's slope s/sqrt(1-s^2), faded in toward the rim),
 *   so the clouds magnify and compress toward the edge like a real ball of glass, with colour
 *   fringing at the rim; then a fresnel rim, a soft specular and a faint thin-film sheen.
 * - Thinking: a broad, soft light orbiting the globe (lit on its normals, so it wraps like light
 *   on a ball), tinted toward the thinking colour.
 * - A halo that hugs the sphere and fades to nothing within a sixth of its radius (`halo`, 0 to 1).
 * It draws on a transparent background, premultiplied. */

import { defineShader, type ShaderDefinition } from "@danolekh/gl";

import { ORB_INPUTS } from "./driver";

export const ORB: ShaderDefinition = defineShader({
  id: "earshot/orb",
  label: "Orb",
  description: "A sphere of drifting sky behind glass, with a soft light that orbits while it thinks.",
  inputs: ORB_INPUTS,
  params: {
    colors: {
      type: "colors",
      default: ["#eef6ff", "#8cc8ff", "#1553c9"],
      min: 3,
      max: 3,
      label: "Top, middle, deep",
    },
    thinkingColor: { type: "color", default: "#8a7cff", label: "Thinking" },
    glass: { type: "float", default: 0.6, min: 0, max: 1, label: "Glass" },
    halo: { type: "float", default: 0.5, min: 0, max: 1, label: "Halo" },
  },
  license: "MIT",
  credit: "Glass after Aave's Building Glass for the Web; domain warping after Inigo Quilez",
  source: `
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
mat3 rotY(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
}

// Thinking shifts the palette toward its own colour, softly.
vec3 tone(vec3 c) {
  return mix(c, uThinkingColor * (0.6 + 0.4 * dot(c, vec3(0.333))), uHue);
}

// The sky inside, at a point q of the unit disc: two layers of cloud at different depths (the
// near one faster and brighter, so they slide past each other), boiling a little with the voice.
vec3 interior(vec2 q) {
  float r2 = min(dot(q, q), 1.0);
  vec3 n = vec3(q, sqrt(1.0 - r2));
  float boil = 1.4 + 0.5 * uLevel;
  vec3 far = rotY(uSpin * 0.6 + uSeed * 6.0) * n * 1.3;
  vec3 wf = vec3(fbm(far + uPhase * 0.5), fbm(far + vec3(5.2, 1.3, 2.8) - uPhase * 0.35), 0.0);
  float cFar = smoothstep(0.4, 0.8, fbm(far + boil * 0.8 * wf + vec3(0.0, 0.0, uPhase * 0.3)));
  vec3 near = rotY(uSpin + uSeed * 6.0 + 1.7) * n * 2.1;
  vec3 wn = vec3(fbm(near + uPhase), fbm(near + vec3(3.1, 7.7, 1.9) - uPhase * 0.8), 0.0);
  float cNear = smoothstep(0.38, 0.82, fbm(near + boil * wn + vec3(0.0, 0.0, uPhase * 0.6)));

  vec3 base = mix(tone(uColors[2]), tone(uColors[1]), smoothstep(-0.9, 0.4, n.y));
  base = mix(base, tone(uColors[0]), smoothstep(0.2, 1.0, n.y) * 0.8);
  vec3 body = mix(base, mix(base, vec3(1.0), 0.55), cFar * 0.6);
  body = mix(body, vec3(1.0), cNear * (0.52 + 0.12 * uLevel));
  body *= mix(1.0, 0.8, 1.0 - n.z);

  // Lit from within: a soft core that swells with the voice and flashes on each syllable.
  float core = exp(-r2 * (3.4 - 1.2 * min(uLight, 1.0))) * (0.07 * min(uLight, 1.2) + 0.05 * uPulse);
  vec3 warm = mix(mix(tone(uColors[1]), tone(uColors[0]), 0.6), vec3(1.0, 0.93, 0.82), 0.3 * uWarmth);
  body += warm * core;

  // A tap: a soft ring of light spreading over the globe from where it was touched.
  if (uTapAge < 2.0) {
    vec2 t2 = vec2(uTapX, uTapY);
    vec3 tn = vec3(t2, sqrt(max(0.0, 1.0 - dot(t2, t2))));
    float along = acos(clamp(dot(n, tn), -1.0, 1.0));
    float wave = exp(-pow((along - uTapAge * 2.2) / 0.22, 2.0)) * exp(-uTapAge * 2.0);
    body += mix(tone(uColors[0]), vec3(1.0), 0.5) * wave * 0.3;
  }

  // Thinking: a broad light orbiting the globe, and a fainter one counter-orbiting, lit on its
  // normals, with a gentle flicker, so it reads as busy rather than just lit.
  vec3 L1 = normalize(vec3(cos(uTime * 2.618), 0.25, sin(uTime * 2.618)));
  vec3 L2 = normalize(vec3(cos(-uTime * 1.7 + 2.0), -0.35, sin(-uTime * 1.7 + 2.0)));
  float flicker = 0.9 + 0.1 * sin(uTime * 9.0) * sin(uTime * 5.3);
  vec3 tint = mix(vec3(1.0), uThinkingColor, 0.5);
  body += uThink * flicker * (0.38 * pow(max(dot(n, L1), 0.0), 2.0) + 0.18 * pow(max(dot(n, L2), 0.0), 3.0)) * tint;
  return body;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
  float R = 0.3 * uScale;
  float d = length(p) - R;
  float aa = fwidth(d) * 1.2;
  float mask = 1.0 - smoothstep(-aa, aa, d);


  vec3 color = vec3(0.0);
  if (d < aa) {
    vec2 q = p / R;
    float r = min(length(q), 0.999);
    vec2 dir = q / max(r, 1e-4);
    // Glass: a spherical cap's slope, faded in toward the rim, pulls the view inward.
    float slope = min(r / sqrt(1.0 - r * r), 3.0);
    float fall = smoothstep(0.45, 1.0, r);
    vec2 disp = dir * slope * fall * 0.07 * uGlass;
    if (fall > 0.02 && uGlass > 0.0) {
      // Colour fringing: red, green and blue bend a little differently.
      color = vec3(interior(q - disp * 0.88).r, interior(q - disp).g, interior(q - disp * 1.12).b);
    } else {
      color = interior(q);
    }
    color *= uBright + 0.03 * uPulse;
    vec3 n = vec3(q, sqrt(1.0 - r * r));
    float fres = pow(1.0 - n.z, 3.0);
    color += tone(mix(uColors[0], vec3(0.75, 0.9, 1.0), 0.5)) * fres * (0.35 + 0.25 * uLevel);
    // The highlight sits up and to the left, and follows a pointer hovering over the glass.
    vec3 key = normalize(mix(vec3(-0.4, 0.6, 0.7), vec3(uPx * 0.8, uPy * 0.8, 0.75), uHover));
    color += pow(max(dot(n, key), 0.0), 40.0) * (0.25 + 0.15 * uHover);
    // A glint along the upper-left rim, like the edge of a lens.
    color += pow(max(dot(dir, normalize(vec2(-0.7, 0.7))), 0.0), 6.0) * smoothstep(0.86, 1.0, r) * 0.22 * uGlass;
    color += (0.5 + 0.5 * cos(6.2831853 * (fres * 1.5 + vec3(0.0, 0.33, 0.67)))) * fres * 0.08 * uGlass;
    // Hiss: fine twinkles in the glass near the rim.
    vec2 g = q * 30.0;
    vec2 cell = floor(g);
    float tw = fract(sin(dot(cell + floor(uPhase * 18.0), vec2(12.9898, 78.233))) * 43758.5453);
    float dot2 = smoothstep(0.45, 0.0, length(fract(g) - 0.5));
    color += uShimmer * step(0.99, tw) * dot2 * smoothstep(0.7, 0.95, r) * 0.1;
    // Tonemap the luminance only, so bright moments stay blue instead of clipping to white.
    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float mapped = lum / (1.0 + 0.7 * max(lum - 0.85, 0.0));
    color *= mapped / max(lum, 1e-4);
  }

  // A halo that hugs the sphere: a narrow Gaussian on the distance from its edge, round by
  // construction and gone long before the canvas ends, so it can never show the canvas's square.
  float w = R * 0.14;
  float halo = uHalo * 0.45 * exp(-pow(max(d, 0.0) / w, 2.0)) * (0.8 + 0.2 * uBright);
  vec3 haloColor = tone(mix(uColors[1], uColors[0], 0.35));
  float a = mask + halo * (1.0 - mask);
  vec3 c = color * mask + haloColor * halo * (1.0 - mask);
  float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  fragColor = vec4(clamp(c, 0.0, 1.0) + dither, clamp(a, 0.0, 1.0));
}
`,
});
