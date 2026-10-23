import * as THREE from 'three';
import {
  BloomEffect,
  Effect,
  EffectAttribute,
  EffectComposer,
  EffectPass,
  FXAAEffect,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { QualityProfile } from '../config/quality';

/** Interleaved gradient noise, shared by every stochastic pass (jitter that TAA-less frames forgive). */
const IGN = /* glsl */ `float ignL(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`;

/** Soft ellipse around the runner: 0 on the figure, 1 well clear of it. */
const PROTECT = /* glsl */ `
  uniform vec2 protectPos;
  uniform vec2 protectSize;
  float protectMask(vec2 p) {
    vec2 q = (p - protectPos) / protectSize;
    return smoothstep(0.75, 1.7, length(q));
  }`;

/**
 * Motion blur. Medium and up: true camera motion blur — each pixel's world position is rebuilt
 * from depth and reprojected with last frame's camera, so the walls rushing past the lens smear
 * hard, the vanishing point stays crisp, and turns, bob and shake streak the way a real shutter
 * would. The shutter opens with speed. The runner rides with the camera, so an ellipse on the
 * figure keeps it sharp and taps that land on it are rejected (no ghosting into the background).
 * A zoom term from the vanishing point adds the stylised rush on top. Low: the zoom term alone,
 * no depth.
 */
/**
 * One NaN or Inf pixel (a shader dividing by zero for a frame) is harmless on its own, but the
 * bloom's mip chain spreads it over the whole image and the frame goes black. This zeroes such
 * pixels (and clamps runaway values) before anything blurs or blooms them.
 */
/**
 * Speed blur (camera reprojection and the edge zoom) is OFF on every tier: the owner prefers a crisp
 * image and speed carried by the camera, parallax and particles. The code path stays: flip this to
 * bring it back (it then builds only where the quality profile asks for it).
 */
const SPEED_BLUR = false;

class NanGuardEffect extends Effect {
  constructor() {
    super(
      'NanGuard',
      /* glsl */ `
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        bool bad = any(isnan(c)) || any(isinf(c)) || c.r != c.r || c.g != c.g || c.b != c.b;
        outputColor = vec4(bad ? vec3(0.0) : min(c, vec3(64000.0)), inputColor.a);
      }`,
    );
  }
}

class MotionBlurEffect extends Effect {
  constructor(samples: number, camera: boolean) {
    super(
      'MotionBlur',
      /* glsl */ `
      ${IGN}
      ${PROTECT}
      uniform float radial;
      uniform float edgeStart;
      uniform vec2 center;
      uniform float aspectRatio;
      uniform float fringe;
      uniform float shutterScale;
      uniform float maxLen;
      uniform mat4 invViewProj;
      uniform mat4 prevViewProj;
      void mainImage(const in vec4 inputColor, const in vec2 uv, ${camera ? 'const in float depth, ' : ''}out vec4 outputColor) {
        vec2 d = uv - center;
        float r = length(vec2(d.x * aspectRatio, d.y));
        // Edge mask: 0 across the centre of the frame (the runner and the way ahead stay crisp),
        // rising toward the edges and corners where the walls rush past the lens.
        // The floor rushing under the lens (bottom of the frame) counts as an edge too.
        float rn = max(r / length(vec2(0.5 * aspectRatio, 0.5)), max(0.0, -d.y) * 1.8);
        float edge = smoothstep(edgeStart, 1.0, rn);
        vec2 v = d * radial * edge;
        ${
          camera
            ? `vec4 wp = invViewProj * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        wp /= wp.w;
        vec4 pc = prevViewProj * wp;
        if (pc.w > 0.01) v += (uv - (pc.xy / pc.w * 0.5 + 0.5)) * shutterScale * edge;`
            : ''
        }
        float m = protectMask(uv);
        v *= m;
        vec2 va = vec2(v.x * aspectRatio, v.y);
        float len = length(va);
        if (len > maxLen) v *= maxLen / len;
        if (len * resolution.y < 1.5) { outputColor = inputColor; return; }
        vec3 acc = vec3(0.0);
        float w = 0.0;
        float w0 = 0.0;
        // Half-amplitude dither: a full 0..1 jitter over only 6–16 taps printed a halftone lattice.
        float jitter = 0.5 + (ignL(gl_FragCoord.xy) - 0.5) * 0.5;
        for (int i = 0; i < ${samples}; i++) {
          float t = (float(i) + jitter) / float(${samples}) - 0.5;
          vec2 o = uv - v * t;
          // Never drag the runner's pixels across the background. A soft weight, not a step: a
          // hard cut printed the edge of the rejected taps as a hard-edged patch beside him.
          float k0 = 1.0 - abs(t);
          float k = smoothstep(0.35, 0.75, protectMask(o)) * k0;
          vec3 c;
          c.r = texture2D(inputBuffer, o - v * fringe).r;
          c.g = texture2D(inputBuffer, o).g;
          c.b = texture2D(inputBuffer, o + v * fringe).b;
          acc += c * k;
          w += k;
          w0 += k0;
        }
        // Where most taps were rejected, fall back to the sharp pixel smoothly.
        outputColor = vec4(mix(inputColor.rgb, acc / max(w, 1e-4), clamp(2.0 * w / w0, 0.0, 1.0)), inputColor.a);
      }`,
      {
        attributes: EffectAttribute.CONVOLUTION | (camera ? EffectAttribute.DEPTH : 0),
        uniforms: new Map<string, THREE.Uniform>([
          ['radial', new THREE.Uniform(0)],
          ['edgeStart', new THREE.Uniform(0.42)],
          ['center', new THREE.Uniform(new THREE.Vector2(0.5, 0.58))],
          ['protectPos', new THREE.Uniform(new THREE.Vector2(0.5, 0.3))],
          ['protectSize', new THREE.Uniform(new THREE.Vector2(0.14, 0.3))],
          ['aspectRatio', new THREE.Uniform(1.6)],
          ['fringe', new THREE.Uniform(0.08)],
          ['shutterScale', new THREE.Uniform(0)],
          ['maxLen', new THREE.Uniform(0.12)],
          ['invViewProj', new THREE.Uniform(new THREE.Matrix4())],
          ['prevViewProj', new THREE.Uniform(new THREE.Matrix4())],
        ]),
      },
    );
  }
}

/**
 * Sun shafts: march from each pixel toward the sun on screen, collecting only what is sky
 * (the depth buffer is clear there) and bright. Arches, pillars and leaf cards cut the light
 * into beams; the result is added before tone mapping so bloom and AgX treat it as light.
 * A second, softer term scatters the same light into the haze so the beams read as volume.
 */
class SunShaftsEffect extends Effect {
  constructor(samples: number) {
    super(
      'SunShafts',
      /* glsl */ `
      uniform vec2 sunPos;
      uniform float strength;
      uniform float aspectRatio;
      uniform vec3 tint;
      uniform float span;
      uniform float calm;
      uniform float clean;
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        if (strength < 0.001) { outputColor = inputColor; return; }
        vec2 delta = sunPos - uv;
        // No per-pixel dither: even at ±0.2 of a step its lattice survived the upscale to the screen
        // as a crosshatch over the haze. The march samples at the half step; the extra taps per tier
        // (see QUALITY.godRays) keep the bands fine enough to read as rays.
        const float jitter = 0.5;
        vec3 acc = vec3(0.0);
        float open = 0.0;
        for (int i = 0; i < ${samples}; i++) {
          float t = (float(i) + jitter) / float(${samples});
          vec2 p = uv + delta * t * 0.96;
          if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) continue;
          if (readDepth(p) < 0.99995) continue;
          // Round 14: the source is despeckled. A hot speck a few pixels wide (a mote: additive, not in
          // the depth) over the sky, or a sky pixel seen through a one-pixel gap in the dithered
          // leaves, was marched into one scaled copy per tap, away from the sun (the depth is read
          // nearest, so with hard edges): a trail of growing pale rectangles. The tap takes the
          // darker of itself and its two diagonal neighbours 2 px out, and counts as sky only as far
          // as they see sky; real openings and the sun's halo are wider and pass unchanged.
          vec2 o = texelSize * 2.0;
          vec3 c = texture2D(inputBuffer, p).rgb;
          float sky = 1.0;
          if (clean > 0.5) {
            vec3 cn = 0.5 * (texture2D(inputBuffer, p + o).rgb + texture2D(inputBuffer, p - o).rgb);
            c = min(c, cn);
            sky = 0.5 * (step(0.99995, readDepth(p + o)) + step(0.99995, readDepth(p - o)));
          }
          float l = max(max(c.r, c.g), c.b);
          acc += sky * min(c, vec3(8.0)) * smoothstep(0.35, 1.6, l) * (0.35 + 0.65 * t);
          open += sky;
        }
        acc /= float(${samples});
        open /= float(${samples});
        // Distance in units of the frame's short side (span = 1 / aspect in portrait): on a tall
        // screen the beams used to reach as far down as on a wide one, i.e. across the whole width
        // and down a third of the height, and veiled the top of the frame.
        float r = length(vec2((uv.x - sunPos.x) * aspectRatio, uv.y - sunPos.y)) * span;
        float fall = exp(-r * (2.4 + 1.2 * calm));
        // In-scatter: warm haze in the light's path, gated by how much sky the pixel can see.
        vec3 veil = tint * open * exp(-r * 4.0) * 0.02 * (1.0 - 0.6 * calm);
        // Light in the air does not lift what is dark behind it (foliage, shade) as much as the sky:
        // keep the blacks.
        float lum = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float keep = mix(0.35, 1.0, smoothstep(0.04, 0.4, lum));
        outputColor = vec4(inputColor.rgb + (acc * tint * fall + veil) * strength * keep * (1.0 - 0.35 * calm), inputColor.a);
      }`,
      {
        attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
        uniforms: new Map<string, THREE.Uniform>([
          ['sunPos', new THREE.Uniform(new THREE.Vector2(0.5, 0.6))],
          ['strength', new THREE.Uniform(0)],
          ['aspectRatio', new THREE.Uniform(1.6)],
          ['tint', new THREE.Uniform(new THREE.Vector3(1.0, 0.8, 0.55))],
          ['span', new THREE.Uniform(1)],
          ['calm', new THREE.Uniform(0)],
          // QA: 0 restores the raw source (no despeckle) for an A/B of the same frame.
          ['clean', new THREE.Uniform(1)],
        ]),
      },
    );
  }
}

/**
 * Exposure plus the lens looking into the sun: a veiling glare, a starburst and a chain of
 * ghosts mirrored through the frame centre. All analytic (no image taps), occlusion-tested
 * against the depth buffer around the sun, so a wall or a canopy swallows the flare. Runs
 * before bloom and tone mapping, so the hot core blooms and the ghosts roll off like light.
 */
class LensEffect extends Effect {
  constructor(occlusion: boolean) {
    super(
      'Lens',
      /* glsl */ `
      uniform vec2 sunPos;
      uniform float sunOn;
      uniform float aspectRatio;
      uniform float exposure;
      uniform float flare;
      uniform float ghosts;
      uniform float ghostNear;
      uniform float glowOnly;
      uniform vec3 sunTint;
      uniform float span;
      uniform float calm;
      float sunVis() {
        ${
          occlusion
            ? `float v = 2.0 * step(0.99995, readDepth(clamp(sunPos, 0.0, 1.0)));
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.7853982;
          vec2 p = clamp(sunPos + vec2(cos(a) / aspectRatio, sin(a)) * 0.014, 0.0, 1.0);
          v += step(0.99995, readDepth(p));
        }
        return v / 10.0;`
            : 'return 1.0;'
        }
      }
      float hexDist(vec2 p) {
        p = abs(p);
        return max(p.x * 0.8660254 + p.y * 0.5, p.y);
      }
      void mainImage(const in vec4 inputColor, const in vec2 uv, ${occlusion ? 'const in float depth, ' : ''}out vec4 outputColor) {
        vec3 c = inputColor.rgb * exposure;
        float on = sunOn * flare;
        if (on > 0.002) {
          float vis = sunVis() * on;
          if (vis > 0.002) {
            vec2 d = uv - sunPos;
            d.x *= aspectRatio;
            float r0 = length(d);
            // The glare and the starburst in units of the frame's short side (span = 1 / aspect in
            // portrait), and gentler there (calm): on a phone they washed out the top 40 % of the
            // frame. The core keeps its size, so the disc stays crisp.
            float r = r0 * span;
            // Glare does not lift the blacks: dark foliage and shade under it keep most of their depth.
            float lum = dot(inputColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            float keep = mix(0.3, 1.0, smoothstep(0.04, 0.4, lum));
            vec3 add = sunTint * ((exp(-r * 3.5) * 0.03 + exp(-r * 10.0) * 0.26) * (1.0 - 0.55 * calm) * keep + exp(-r0 * 34.0) * 2.0);
            // Low tier (no bloom, no shafts, no flare): the glare alone, a touch wider, stands in for
            // the light those passes add, or the frame reads dull and dark at speed.
            if (glowOnly > 0.5) {
              add = sunTint * ((exp(-r * 2.6) * 0.09 + exp(-r * 8.0) * 0.32) * (1.0 - 0.45 * calm) * keep + exp(-r0 * 30.0) * 1.6);
              c += add * vis;
              outputColor = vec4(c, inputColor.a);
              return;
            }
            float ang = atan(d.y, d.x);
            float rays = pow(abs(cos(ang * 3.0 + 0.4)), 90.0) + 0.6 * pow(abs(cos(ang * 5.0 + 1.3)), 160.0);
            // A few crisp rays for drama: shorter and dimmer on a tall screen.
            // (Measured halfway between the two scales, so on a phone they still reach past the disc.)
            add += sunTint * rays * exp(-r0 * mix(1.0, span, 0.45) * 7.0) * 0.7 * (1.0 - 0.15 * calm) * mix(0.6, 1.0, keep);
            // Anamorphic streak.
            add += vec3(1.0, 0.82, 0.62) * exp(-abs(d.y) * 140.0) * exp(-abs(d.x) * span * 2.2) * 0.5 * (1.0 - 0.5 * calm);
            // Ghosts on the line through the centre.
            vec2 axis = vec2(0.5) - sunPos;
            const int G = 5;
            float gk[5] = float[5](0.55, 1.15, 1.45, 1.9, 2.4);
            float gs[5] = float[5](0.035, 0.075, 0.03, 0.12, 0.05);
            vec3 gc[5] = vec3[5](vec3(1.0, 0.7, 0.35), vec3(0.45, 0.75, 1.0), vec3(1.0, 0.55, 0.8), vec3(0.5, 1.0, 0.7), vec3(1.0, 0.85, 0.5));
            // Round 19: the ghosts are faint and soft, and they give way to anything near the lens
            // (a coloured hexagon sat on the runner's back like a sticker): full over the far scene
            // and the sky, gone over what is nearer than ~8 m (him, the causeway under him).
            ${occlusion ? 'float far = mix(1.0, smoothstep(8.0, 22.0, -getViewZ(depth)), ghostNear);' : 'float far = 1.0;'}
            for (int i = 0; i < G; i++) {
              vec2 gp = sunPos + axis * gk[i];
              vec2 gd = uv - gp;
              gd.x *= aspectRatio;
              float h = hexDist(gd) / gs[i];
              float disc = smoothstep(1.0, 0.62, h) * (0.5 + 0.5 * smoothstep(0.2, 0.95, h));
              add += gc[i] * disc * 0.02 * far * ghosts;
            }
            // A halo ring at a fixed radius around the frame centre on the sun's side.
            vec2 hc = uv - (sunPos + axis * 1.0);
            hc.x *= aspectRatio;
            float ring = exp(-pow((length(hc) - 0.42) * 22.0, 2.0));
            add += vec3(0.9, 0.8, 1.0) * ring * 0.03 * far * ghosts;
            c += add * vis;
          }
        }
        outputColor = vec4(c, inputColor.a);
      }`,
      {
        attributes: occlusion ? EffectAttribute.DEPTH : EffectAttribute.NONE,
        uniforms: new Map<string, THREE.Uniform>([
          ['sunPos', new THREE.Uniform(new THREE.Vector2(0.5, 0.8))],
          ['sunOn', new THREE.Uniform(0)],
          ['aspectRatio', new THREE.Uniform(1.6)],
          ['exposure', new THREE.Uniform(1)],
          ['flare', new THREE.Uniform(1)],
          // QA (tools/ghost-check.mjs): 0 draws the flare without its ghosts and halo.
          ['ghosts', new THREE.Uniform(1)],
          // QA (ghost-check --selftest): 0 restores the old ghosts over near things.
          ['ghostNear', new THREE.Uniform(1)],
          ['glowOnly', new THREE.Uniform(occlusion ? 0 : 1)],
          ['span', new THREE.Uniform(1)],
          ['calm', new THREE.Uniform(0)],
          ['sunTint', new THREE.Uniform(new THREE.Vector3(1.0, 0.86, 0.64))],
        ]),
      },
    );
  }
}

/**
 * Screen-space reflections on the water (High and up). The water writes a marker into alpha;
 * for those pixels a ray is reflected off the rippled plane and marched through the depth
 * buffer, and where it meets a cliff, wall or tree its colour is mixed in by Fresnel. Rays that
 * leave the screen keep the panorama reflection the water shader already drew.
 */
class WaterReflectEffect extends Effect {
  constructor(steps: number) {
    super(
      'WaterReflect',
      /* glsl */ `
      ${IGN}
      uniform mat4 invViewProj;
      uniform mat4 viewProj;
      uniform vec3 camPos;
      uniform float waterTime;
      uniform float aspect;
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        outputColor = inputColor;
        if (inputColor.a > 0.6 || depth > 0.99999) return;
        vec4 wp = invViewProj * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec3 P = wp.xyz / wp.w;
        vec3 toP = P - camPos;
        float dist = length(toP);
        vec3 V = toP / dist;
        vec2 g = vec2(sin(P.x * 1.3 + waterTime * 1.4) + sin(P.z * 0.7 - waterTime * 1.1), cos(P.z * 1.6 + waterTime * 1.2) + cos(P.x * 0.9 + waterTime * 0.8));
        g *= 0.022 / (1.0 + dist * 0.03);
        vec3 N = normalize(vec3(g.x, 1.0, g.y));
        vec3 R = reflect(V, N);
        float s0 = 0.35 + dist * 0.035;
        // A small dither (a quarter of a step): the bisection below finds the true crossing, so the
        // jitter only has to hide the step pattern, not stand in for precision. The full 0..1 jitter
        // printed a dotted mosaic over the far water.
        float jitter = 0.5 + (ignL(gl_FragCoord.xy) - 0.5) * 0.25;
        float t0 = 0.0;
        float t1 = 0.0;
        float hit = 0.0;
        float fi = 0.0;
        for (int i = 0; i < ${steps}; i++) {
          fi = float(i) + jitter;
          float t = s0 * fi * (1.0 + fi * 0.18);
          vec3 Q = P + R * t;
          vec4 cq = viewProj * vec4(Q, 1.0);
          if (cq.w <= 0.01) break;
          vec3 n = cq.xyz / cq.w;
          vec2 q = n.xy * 0.5 + 0.5;
          if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) break;
          float sd = readDepth(q);
          float rd = n.z * 0.5 + 0.5;
          if (sd < 0.99999 && rd > sd) {
            t1 = t;
            hit = 1.0;
            break;
          }
          t0 = t;
        }
        if (hit < 0.5) return;
        // Bisect between the last step in front of the surface and the first behind it: the hit is
        // found to a fraction of a step, so reflected edges are smooth lines, not a staircase of
        // step-sized patches.
        vec2 hitUV = vec2(0.0);
        float gap = 0.0;
        for (int k = 0; k < 6; k++) {
          float tm = 0.5 * (t0 + t1);
          vec4 cq = viewProj * vec4(P + R * tm, 1.0);
          vec3 n = cq.xyz / cq.w;
          vec2 q = n.xy * 0.5 + 0.5;
          float sd = readDepth(q);
          float rd = n.z * 0.5 + 0.5;
          if (sd < 0.99999 && rd > sd) {
            t1 = tm;
            hitUV = q;
            gap = getViewZ(sd) - getViewZ(rd);
          } else t0 = tm;
        }
        if (hitUV == vec2(0.0)) {
          vec4 cq = viewProj * vec4(P + R * t1, 1.0);
          hitUV = cq.xy / cq.w * 0.5 + 0.5;
        }
        // Thickness: a ray passing well behind a surface (a thin pillar seen past its edge) fades out
        // instead of cutting off.
        float thick = 1.2 + t1 * 0.12;
        float solid = 1.0 - smoothstep(thick * 0.5, thick, abs(gap));
        vec2 e = smoothstep(vec2(0.0), vec2(0.08), hitUV) * smoothstep(vec2(1.0), vec2(0.92), hitUV);
        float fade = e.x * e.y * (1.0 - smoothstep(0.55, 1.0, fi / float(${steps}))) * solid;
        // Glossy, not mirror-sharp: the ripples blur the reflection more the further it travels
        // (a cheap cone: five taps across a footprint that grows with the reflected distance).
        float rough = 0.0015 + t1 * 0.0007 + length(g) * 0.12;
        vec2 px = vec2(rough / aspect, rough);
        vec4 hc = texture2D(inputBuffer, hitUV) * 0.4;
        hc += texture2D(inputBuffer, hitUV + vec2(px.x, 0.0)) * 0.15;
        hc += texture2D(inputBuffer, hitUV - vec2(px.x, 0.0)) * 0.15;
        hc += texture2D(inputBuffer, hitUV + vec2(0.0, px.y)) * 0.15;
        hc += texture2D(inputBuffer, hitUV - vec2(0.0, px.y)) * 0.15;
        // A reflection of the water itself keeps the panorama (fade, not a cut).
        fade *= smoothstep(0.45, 0.75, hc.a);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        vec3 refl = hc.rgb * vec3(0.82, 0.92, 0.9);
        outputColor = vec4(mix(inputColor.rgb, refl, clamp(fres * 1.15, 0.0, 0.92) * fade), inputColor.a);
      }`,
      {
        attributes: EffectAttribute.CONVOLUTION | EffectAttribute.DEPTH,
        uniforms: new Map<string, THREE.Uniform>([
          ['invViewProj', new THREE.Uniform(new THREE.Matrix4())],
          ['viewProj', new THREE.Uniform(new THREE.Matrix4())],
          ['camPos', new THREE.Uniform(new THREE.Vector3())],
          ['waterTime', new THREE.Uniform(0)],
          ['aspect', new THREE.Uniform(1.6)],
        ]),
      },
    );
  }
}

/**
 * Ambient occlusion from the depth buffer alone (no normal pass, no extra scene draws), in three
 * screen passes of its own, then multiplied over the frame:
 *  1. occlusion: view-space positions rebuilt from depth (through the inverse projection, so the
 *     rig's view offset is honoured), the normal from the nearer neighbour on each axis, and a spiral
 *     of taps measuring how far the surrounding geometry closes over the point, at two scales (the
 *     seams between blocks, and the depth of a wall course or a ledge);
 *  2–3. a depth-aware 4×4 blur. The spiral's rotation follows a 4×4 interleaved pattern, so the blur
 *     cancels it exactly (the single-pass version printed that pattern as a hatched moiré over every
 *     floor), and taps across a depth edge are rejected, so nothing bleeds round the runner (no halo).
 * Fades out with distance, and never touches the sky.
 */
const AO_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const AO_DEPTH = /* glsl */ `
  #include <packing>
  uniform sampler2D tDepth;
  uniform mat4 projInv;
  uniform float cNear;
  uniform float cFar;
  float rawDepth(vec2 p) {
    #if DEPTH_RGBA
      return unpackRGBAToDepth(texture2D(tDepth, p));
    #else
      return texture2D(tDepth, p).r;
    #endif
  }
  vec3 viewPos(vec2 p) {
    float d = rawDepth(p);
    vec4 v = projInv * vec4(p * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    return v.xyz / v.w;
  }`;

class DepthAOEffect extends Effect {
  private rtA = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, type: THREE.HalfFloatType, format: THREE.RGBAFormat });
  private rtB = this.rtA.clone();
  private quad: THREE.Mesh;
  private cam2 = new THREE.Camera();
  private scene2 = new THREE.Scene();
  private occMat: THREE.ShaderMaterial;
  private blurMat: THREE.ShaderMaterial;
  private camera: THREE.PerspectiveCamera;

  constructor(samples: number, camera: THREE.Camera, private scale = 1) {
    super(
      'DepthAO',
      /* glsl */ `
      uniform sampler2D tAO;
      uniform float aoStrength;
      void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
        float ao = texture2D(tAO, uv).r;
        outputColor = vec4(inputColor.rgb * mix(1.0, ao, aoStrength), inputColor.a);
      }`,
      {
        attributes: EffectAttribute.DEPTH,
        uniforms: new Map<string, THREE.Uniform>([
          ['tAO', new THREE.Uniform(null)],
          ['aoStrength', new THREE.Uniform(0.85)],
          ['projInfo', new THREE.Uniform(new THREE.Vector2(1, 1))],
        ]),
      },
    );
    this.camera = camera as THREE.PerspectiveCamera;
    const common = { tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, cNear: { value: 0.1 }, cFar: { value: 2400 }, texel: { value: new THREE.Vector2(1, 1) }, pxPerM: { value: 1 } };
    this.occMat = new THREE.ShaderMaterial({
      defines: { SAMPLES: samples, DEPTH_RGBA: 0 },
      uniforms: { ...common },
      vertexShader: AO_VERT,
      fragmentShader: /* glsl */ `
        ${AO_DEPTH}
        uniform vec2 texel;
        uniform float pxPerM;
        varying vec2 vUv;
        void main() {
          float d = rawDepth(vUv);
          if (d > 0.99999) { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; }
          vec3 P = viewPos(vUv);
          float dist = -P.z;
          float fade = 1.0 - smoothstep(30.0, 70.0, dist);
          if (fade < 0.01) { gl_FragColor = vec4(1.0, dist, 0.0, 1.0); return; }
          vec3 px = viewPos(vUv + vec2(texel.x, 0.0)) - P;
          vec3 nx = P - viewPos(vUv - vec2(texel.x, 0.0));
          vec3 py = viewPos(vUv + vec2(0.0, texel.y)) - P;
          vec3 ny = P - viewPos(vUv - vec2(0.0, texel.y));
          vec3 N = normalize(cross(abs(px.z) < abs(nx.z) ? px : nx, abs(py.z) < abs(ny.z) ? py : ny));
          if (dot(N, P) > 0.0) N = -N;
          // 4×4 interleaved rotation (cancelled exactly by the 4×4 blur).
          vec2 cell = mod(floor(gl_FragCoord.xy), 4.0);
          float a0 = (cell.x * 4.0 + cell.y) * (6.2831853 / 16.0) + mod(cell.y, 2.0) * 0.2;
          float occ = 0.0;
          float wsum = 0.0;
          for (int s = 0; s < 2; s++) {
            // Two radii: the joints between blocks, and a wall course or a ledge.
            float R = s == 0 ? 0.35 : 1.25;
            float rPx = clamp(R * pxPerM / dist, 2.0, 90.0);
            for (int i = 0; i < SAMPLES; i++) {
              float t = (float(i) + 0.5) / float(SAMPLES);
              float a = a0 + t * 13.7 + float(s) * 1.3;
              vec2 o = vec2(cos(a), sin(a)) * (t * t * 0.85 + 0.15) * rPx * texel;
              vec3 v = viewPos(vUv + o) - P;
              float l = length(v);
              float w = 1.0 - smoothstep(R * 0.6, R * 1.6, l);
              occ += max(dot(N, v / max(l, 1e-4)) - 0.1, 0.0) * w;
              wsum += 1.0;
            }
          }
          occ = clamp(occ / wsum * 2.2, 0.0, 1.0) * fade;
          gl_FragColor = vec4(1.0 - occ, dist, 0.0, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tAO: { value: null }, texel: { value: new THREE.Vector2(1, 1) }, dir: { value: new THREE.Vector2(1, 0) } },
      vertexShader: AO_VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tAO;
        uniform vec2 texel;
        uniform vec2 dir;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tAO, vUv);
          if (c.g <= 0.0) { gl_FragColor = c; return; }
          float sum = 0.0;
          float w = 0.0;
          // Four taps, -1.5..+1.5 texels: with the 4-cell rotation pattern this is an exact average.
          for (int i = 0; i < 4; i++) {
            float k = float(i) - 1.5;
            vec4 s = texture2D(tAO, vUv + dir * texel * k);
            float wd = s.g > 0.0 ? exp(-abs(s.g - c.g) / (0.03 * c.g + 0.02) ) : 0.0;
            sum += s.r * wd;
            w += wd;
          }
          gl_FragColor = vec4(w > 1e-4 ? sum / w : c.r, c.g, 0.0, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.occMat);
    this.quad.frustumCulled = false;
    this.scene2.add(this.quad);
    this.uniforms.get('tAO')!.value = this.rtA.texture;
  }

  override setDepthTexture(depthTexture: THREE.Texture, depthPacking: THREE.DepthPackingStrategies = THREE.BasicDepthPacking): void {
    this.occMat.uniforms.tDepth!.value = depthTexture;
    const rgba = depthPacking === THREE.RGBADepthPacking ? 1 : 0;
    if (this.occMat.defines.DEPTH_RGBA !== rgba) {
      this.occMat.defines.DEPTH_RGBA = rgba;
      this.occMat.needsUpdate = true;
    }
  }

  override setSize(width: number, height: number): void {
    // Medium draws the occlusion at half resolution (a quarter of the cost); it is low-frequency
    // after the blur, and the composite reads it filtered.
    const w = Math.max(1, Math.round(width * this.scale));
    const h = Math.max(1, Math.round(height * this.scale));
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
    this.occMat.uniforms.texel!.value.set(1 / w, 1 / h);
    this.blurMat.uniforms.texel!.value.set(1 / w, 1 / h);
  }

  override update(renderer: THREE.WebGLRenderer): void {
    const cam = this.camera;
    const u = this.occMat.uniforms;
    u.projInv!.value.copy(cam.projectionMatrixInverse);
    u.cNear!.value = cam.near;
    u.cFar!.value = cam.far;
    // Pixels per metre at 1 m from the lens.
    u.pxPerM!.value = (cam.projectionMatrix.elements[5]! * 0.5) / u.texel!.value.y;
    const prev = renderer.getRenderTarget();
    this.quad.material = this.occMat;
    renderer.setRenderTarget(this.rtA);
    renderer.render(this.scene2, this.cam2);
    this.quad.material = this.blurMat;
    this.blurMat.uniforms.tAO!.value = this.rtA.texture;
    this.blurMat.uniforms.dir!.value.set(1, 0);
    renderer.setRenderTarget(this.rtB);
    renderer.render(this.scene2, this.cam2);
    this.blurMat.uniforms.tAO!.value = this.rtB.texture;
    this.blurMat.uniforms.dir!.value.set(0, 1);
    renderer.setRenderTarget(this.rtA);
    renderer.render(this.scene2, this.cam2);
    renderer.setRenderTarget(prev);
  }

  override dispose(): void {
    super.dispose();
    this.rtA.dispose();
    this.rtB.dispose();
    this.occMat.dispose();
    this.blurMat.dispose();
  }
}

/**
 * Contrast-adaptive sharpening (after AMD FidelityFX CAS, 5-tap cross). Restores the edge contrast
 * a frame loses when it is drawn below the screen's pixel ratio and stretched by the browser; the
 * per-pixel weight backs off where the neighbourhood already spans the full range, so it does not
 * ring or amplify noise. Runs on HDR input, in a Reinhard-compressed domain. First in the final
 * pass (it is its only convolution), so it costs four extra taps and no extra pass.
 */
class SharpenEffect extends Effect {
  constructor() {
    super(
      'Sharpen',
      /* glsl */ `
      uniform float sharpness;
      vec3 casIn(vec3 c) { return c / (1.0 + c); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        if (sharpness < 0.001) { outputColor = inputColor; return; }
        vec3 e = casIn(max(inputColor.rgb, 0.0));
        vec3 b = casIn(max(texture2D(inputBuffer, uv + vec2(0.0, texelSize.y)).rgb, 0.0));
        vec3 d = casIn(max(texture2D(inputBuffer, uv - vec2(texelSize.x, 0.0)).rgb, 0.0));
        vec3 f = casIn(max(texture2D(inputBuffer, uv + vec2(texelSize.x, 0.0)).rgb, 0.0));
        vec3 h = casIn(max(texture2D(inputBuffer, uv - vec2(0.0, texelSize.y)).rgb, 0.0));
        vec3 mn = min(e, min(min(b, d), min(f, h)));
        vec3 mx = max(e, max(max(b, d), max(f, h)));
        vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
        // Leave near-flat neighbourhoods alone: there the only contrast is dither (shaft and PCF
        // jitter, grain), and sharpening it would print the noise pattern over the sky.
        vec3 rng = mx - mn;
        float edge = smoothstep(0.015, 0.05, max(rng.r, max(rng.g, rng.b)));
        vec3 w = -amp * (0.2 * sharpness * edge);
        vec3 r = clamp((e + (b + d + f + h) * w) / (1.0 + 4.0 * w), 0.0, 0.998);
        outputColor = vec4(r / (1.0 - r), inputColor.a);
      }`,
      {
        attributes: EffectAttribute.CONVOLUTION,
        uniforms: new Map<string, THREE.Uniform>([['sharpness', new THREE.Uniform(0)]]),
      },
    );
  }
}

/** Mood: warmth, contrast, danger heat, the cold of a fall and the gold of an escape. */
class GradeEffect extends Effect {
  constructor() {
    super(
      'Grade',
      /* glsl */ `
      uniform float saturation;
      uniform float contrast;
      uniform vec3 tint;
      uniform float danger;
      uniform float cold;
      uniform float gold;
      uniform float flash;
      uniform float fade;
      uniform float tension;
      uniform float coolTop;
      uniform float finish;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, saturation + gold * 0.15 - cold * 0.6 + tension * 0.07);
        // Split tone: shade stays warm-neutral (sunlit stone bounces into it), the lights bleach
        // toward cream the way a sun-drenched frame does; only the deepest darks lean teal.
        float hl = smoothstep(0.1, 0.75, l);
        float deep = smoothstep(0.12, 0.0, l);
        c *= mix(vec3(1.03, 0.99, 0.95), vec3(1.06, 1.01, 0.9), hl);
        c = mix(c, c * vec3(0.94, 1.0, 1.03), deep * 0.35);
        float cream = smoothstep(0.62, 0.98, l);
        c = mix(c, vec3(l) * vec3(1.04, 0.99, 0.88) + (c - vec3(l)) * 0.55, cream * 0.5);
        // A soft S-curve around mid grey rather than a straight contrast stretch.
        vec3 k = clamp(c, 0.0, 1.0);
        vec3 s = k * k * (3.0 - 2.0 * k);
        c = mix(c, mix(k, s, 0.22), step(c, vec3(1.0)));
        // Contrast about mid grey with a soft toe. A straight (c - 0.5) * k + 0.5 in this linear
        // space clipped everything under ~0.04 (sRGB ~0.2) to pure black: backlit jungle and cliffs
        // against the sun became flat black holes in the sky, and deep shade lost all detail.
        // Here the offset fades in with c, so the curve is the same above ~0.3 and reaches 0 only at 0.
        float kc = contrast + danger * 0.06 + cold * 0.1 + tension * 0.09;
        c = max(c, 0.0);
        c = c * kc - (kc - 1.0) * 0.5 * (c / (c + 0.15));
        // Round 14 finish (world request): no grey veil. Haze, bloom and the lens lift the darkest
        // values to a milky pedestal; a soft black toe takes it back out (about −8 % at 0.02, −2 % at
        // 0.1, the whites kept), the shadows lean teal and the lights warm a touch. Subtle:
        // 'finish' scales it (0 = the old grade, for before/after QA).
        {
          // c·(c + 0.65p)/(c + p): the slope at black stays 0.65 (the deepest shade darkens by a third,
          // it never crushes to 0 — a straight c²/(c+p) toe printed black holes again).
          float pk = 0.006 * finish;
          c = max(c, 0.0);
          c = c * (c + 0.65 * pk) / (c + pk) * (1.0 + 0.35 * pk);
          float lf = dot(c, vec3(0.2126, 0.7152, 0.0722));
          float shade = 1.0 - smoothstep(0.015, 0.22, lf);
          // (Warmth fades out as a channel nears white, so it never pushes a highlight into clipping.)
          float lights = smoothstep(0.35, 0.9, lf) * (1.0 - smoothstep(0.82, 1.0, max(c.r, max(c.g, c.b))));
          c *= mix(vec3(1.0), vec3(0.95, 1.0, 1.045), shade * 0.55 * finish);
          c *= mix(vec3(1.0), vec3(1.025, 1.0, 0.965), lights * finish);
        }
        c *= tint;
        // Tension (the live multiplier, nothing else): the light warms toward late afternoon and
        // the shade sinks, a little more with every doubling.
        c = mix(c, c * mix(vec3(0.95, 0.94, 0.96), vec3(1.07, 0.99, 0.88), hl), tension * 0.55);
        // Phones: the upper sky over a tall frame is a large flat field of warm grey; a cool
        // teal-green lean there (and in the shade) gives the warm key light its counterpoint.
        float upper = smoothstep(0.5, 1.0, uv.y);
        c = mix(c, c * vec3(0.92, 1.01, 1.05), coolTop * (upper * 0.55 + deep * 0.45));
        // Danger: embers in the highlights, a clamp in the shadows.
        c = mix(c, c * vec3(1.1, 0.95, 0.86), danger * 0.4);
        // Fall: blue-grey and heavy.
        c = mix(c, c * vec3(0.78, 0.86, 1.0) * 0.8, cold);
        // Escape: honey light.
        c = mix(c, c * vec3(1.1, 1.0, 0.84), gold);
        c += vec3(1.0, 0.92, 0.78) * flash;
        c = mix(c, vec3(0.03, 0.025, 0.02), fade);
        outputColor = vec4(max(c, 0.0), inputColor.a);
      }`,
      {
        uniforms: new Map<string, THREE.Uniform>([
          ['saturation', new THREE.Uniform(1.14)],
          ['contrast', new THREE.Uniform(1.13)],
          ['tint', new THREE.Uniform(new THREE.Vector3(1.025, 0.995, 0.95))],
          ['danger', new THREE.Uniform(0)],
          ['cold', new THREE.Uniform(0)],
          ['gold', new THREE.Uniform(0)],
          ['flash', new THREE.Uniform(0)],
          ['fade', new THREE.Uniform(0)],
          ['tension', new THREE.Uniform(0)],
          ['coolTop', new THREE.Uniform(0)],
          ['finish', new THREE.Uniform(1)],
        ]),
      },
    );
  }
}

export interface PostParams {
  speed: number; // 0..1
  runnerScreen: THREE.Vector2; // uv of runner's chest
  /** Half-size of the runner's sharp zone in uv (x, y). Optional: a default ellipse otherwise. */
  runnerSize?: THREE.Vector2;
  danger: number;
  cold: number;
  gold: number;
  flash: number;
  fade: number;
  bloomBoost: number;
  /** 0..1 from the live multiplier during a run (0 outside it): the tension ramp of the grade. */
  tension?: number;
  /** 1 with full motion, 0 when the player asked for reduced motion (no camera blur). */
  motion?: number;
  /** Frame time in seconds (for the shutter). */
  dt?: number;
  /** World time, for the water ripples in the reflections. */
  time?: number;
}

/** Bloom strength at rest (was 0.75: with the sky over the threshold it veiled the top of the frame). */
const BLOOM = 0.5;

/** Base exposure: the sun-drenched references sit well above a neutral grey. */
export const EXPOSURE = 1.14;

export class Post {
  readonly composer: EffectComposer;
  private blur: MotionBlurEffect | null = null;
  private blurPass: EffectPass | null = null;
  private cameraBlur = false;
  private sharpen = new SharpenEffect();
  private sharpenBase = 0;
  private shafts: SunShaftsEffect | null = null;
  private lens: LensEffect | null = null;
  private ssr: WaterReflectEffect | null = null;
  private ao: DepthAOEffect | null = null;
  private sun: THREE.Object3D | null = null;
  private sunV = new THREE.Vector3();
  private grade = new GradeEffect();
  private bloom: BloomEffect | null = null;
  private vignette = new VignetteEffect({ offset: 0.28, darkness: 0.55 });
  private renderPass: RenderPass;
  private vp = new THREE.Matrix4();
  private prevVP = new THREE.Matrix4();
  private invVP = new THREE.Matrix4();
  private hasPrev = false;
  private flareOn = true;
  /**
   * Per time-of-day look (round 13): the overcast storm lands ~30 % darker than the clear looks
   * (mean 0.24 vs 0.31–0.35 on desktop High, runner contrast 0.13 vs 0.21); a modest lift keeps it
   * moody but readable, on phone Low too. Clear looks stay at 1 (none clips).
   */
  lookExposure = 1;
  private near = -1;
  private exposureK = 1;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    q: QualityProfile,
  ) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.renderPass = new RenderPass(scene, camera);
    this.build(q);
  }

  build(q: QualityProfile): void {
    this.composer.removeAllPasses();
    // Ultra: 4× MSAA on the scene render (geometric edges: wall courses, pillars, the runner).
    this.composer.multisampling = Math.min(q.msaa, this.renderer.capabilities.maxSamples);
    this.composer.addPass(this.renderPass);
    this.ssr = q.waterReflections > 0 ? new WaterReflectEffect(q.waterReflections) : null;
    // The guard runs first, on the raw render, so nothing downstream ever sees a NaN pixel.
    // Its own pass: the effects after it sample their input buffer directly, so it must be written first.
    this.composer.addPass(new EffectPass(this.camera, new NanGuardEffect()));
    if (this.ssr) this.composer.addPass(new EffectPass(this.camera, this.ssr));
    this.shafts = q.godRays > 0 ? new SunShaftsEffect(q.godRays) : null;
    this.ao = q.ao > 0 ? new DepthAOEffect(q.ao, this.camera, q.pixelRatioCap < 2 ? 0.5 : 1) : null;
    const lightFx = [this.ao, this.shafts].filter((e): e is DepthAOEffect | SunShaftsEffect => e !== null);
    if (lightFx.length) this.composer.addPass(new EffectPass(this.camera, ...lightFx));
    this.cameraBlur = q.motionBlur === 'camera';
    this.blur = SPEED_BLUR && q.speedBlur ? new MotionBlurEffect(q.blurSamples, this.cameraBlur) : null;
    this.blurPass = this.blur ? new EffectPass(this.camera, this.blur) : null;
    if (this.blurPass) this.composer.addPass(this.blurPass);
    this.hasPrev = false;
    this.sharpenBase = q.sharpen;
    // Bloom: a tight radius and a high knee, so the sky does not haze over every silhouette (a soft
    // halo around all edges against the sky reads as a blurred, milky frame). Only the hot sun,
    // its glints and the cash-out flare bloom.
    this.bloom = q.bloom ? new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.3, luminanceSmoothing: 0.3, intensity: BLOOM, radius: 0.45 }) : null;
    this.lens = new LensEffect(q.lensFlare);
    // Bloom and the shafts add light to a High frame; without them the Low frame sits a stop dimmer.
    this.exposureK = q.bloom ? 1 : 1.07;
    this.flareOn = q.lensFlare;
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    // No film grain: per-pixel noise drawn below the screen's pixel ratio and stretched by the
    // browser reads as a dirty crosshatch over the fog and sky on a phone.
    const effects: Effect[] = [this.sharpen, this.lens];
    if (this.bloom) effects.push(this.bloom);
    effects.push(tone, this.grade, this.vignette);
    this.composer.addPass(new EffectPass(this.camera, ...effects));
    if (q.smaa) this.composer.addPass(new EffectPass(this.camera, new SMAAEffect()));
    else if (q.fxaa) this.composer.addPass(new EffectPass(this.camera, new FXAAEffect()));
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    // Sharpen harder the more the browser will stretch this frame (screen px per drawn px).
    const up = (globalThis.devicePixelRatio || 1) / Math.max(0.25, this.renderer.getPixelRatio());
    this.sharpen.uniforms.get('sharpness')!.value = Math.min(1, this.sharpenBase + 0.35 * Math.min(1.5, Math.max(0, up - 1)));
    for (const e of [this.blur, this.shafts, this.lens]) if (e) e.uniforms.get('aspectRatio')!.value = w / h;
    if (this.ssr) this.ssr.uniforms.get('aspect')!.value = w / h;
    // Portrait: sun glare and shafts are sized by the short side and toned down (see the shaders).
    const a = w / h;
    for (const e of [this.shafts, this.lens]) {
      if (!e) continue;
      e.uniforms.get('span')!.value = Math.max(1, 1 / a);
      e.uniforms.get('calm')!.value = Math.min(1, Math.max(0, (1 - a) / 0.45));
    }
    this.grade.uniforms.get('coolTop')!.value = 0.5 * Math.min(1, Math.max(0, (1 - a) / 0.45));
  }

  apply(p: PostParams): void {
    const cam = this.camera as THREE.PerspectiveCamera;
    cam.updateMatrixWorld();
    this.vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    if (!this.hasPrev) this.prevVP.copy(this.vp);
    this.invVP.copy(this.vp).invert();
    if (this.blur && this.blurPass) {
      const u = this.blur.uniforms;
      const motion = p.motion ?? 1;
      // Speed blur at the frame edges only (the edge mask in the shader keeps the centre, the runner
      // and the way ahead crisp): nothing at rest or at a jog — `speed` is (m/s − 4) / 10, so the
      // pass is skipped below ~6.5 m/s (about 1.6×) — then it eases in with real speed and peaks at
      // the top tiers. Portrait screens put the walls right at the frame edges: a lighter touch.
      const x = Math.min(1, Math.max(0, (p.speed - 0.25) / 0.6));
      const rush = x * x * (3 - 2 * x) * motion;
      const portrait = cam.aspect < 1 ? 0.55 : 1;
      u.get('edgeStart')!.value = cam.aspect < 1 ? 0.5 : 0.4;
      this.blurPass.enabled = rush > 0.002;
      u.get('protectPos')!.value.copy(p.runnerScreen);
      if (p.runnerSize) u.get('protectSize')!.value.copy(p.runnerSize);
      u.get('fringe')!.value = 0.02 + rush * 0.04;
      if (this.cameraBlur) {
        // Shutter in seconds: up to ~1/40 s at full tilt (was 1/60 s even standing still).
        const shutter = 0.03 * rush * portrait;
        u.get('shutterScale')!.value = shutter / Math.max(1 / 240, p.dt ?? 1 / 60);
        u.get('radial')!.value = rush * 0.07 * portrait;
        u.get('maxLen')!.value = (0.012 + 0.05 * rush) * portrait;
        u.get('invViewProj')!.value.copy(this.invVP);
        u.get('prevViewProj')!.value.copy(this.prevVP);
      } else {
        u.get('radial')!.value = rush * 0.08 * portrait;
        u.get('maxLen')!.value = (0.012 + 0.045 * rush) * portrait;
      }
    }
    if (this.ssr) {
      const u = this.ssr.uniforms;
      u.get('invViewProj')!.value.copy(this.invVP);
      u.get('viewProj')!.value.copy(this.vp);
      u.get('camPos')!.value.setFromMatrixPosition(cam.matrixWorld);
      u.get('waterTime')!.value = p.time ?? 0;
    }
    this.prevVP.copy(this.vp);
    this.hasPrev = true;
    const g = this.grade.uniforms;
    g.get('danger')!.value = p.danger;
    g.get('cold')!.value = p.cold;
    g.get('gold')!.value = p.gold;
    g.get('flash')!.value = p.flash;
    g.get('fade')!.value = p.fade;
    if (this.bloom) this.bloom.intensity = BLOOM + 0.5 * p.bloomBoost;
    const tension = p.tension ?? 0;
    g.get('tension')!.value = tension;
    // The frame closes in as the multiplier climbs.
    this.vignette.darkness = 0.5 + p.speed * 0.2 + p.cold * 0.25 + tension * 0.3;
    this.vignette.offset = 0.28 - tension * 0.08;
    if (this.lens) this.lens.uniforms.get('exposure')!.value = EXPOSURE * this.exposureK * this.lookExposure * (1 - 0.12 * p.cold);
  }

  /** Place the shafts and the flare on the sun disc (found by name in the scene), fading as it leaves the frame. */
  private warned = false;
  /** Every effect uniform finite: a stray NaN or Inf (one frame is enough) blacks out the image. */
  private sanitize(): void {
    let bad = '';
    for (const e of [this.blur, this.shafts, this.lens, this.ssr, this.ao, this.grade]) {
      if (!e) continue;
      for (const [k, u] of e.uniforms) {
        const v = u.value as unknown;
        if (typeof v === 'number') {
          if (!Number.isFinite(v)) ((u.value = 0), (bad ||= k));
        } else if (v && typeof v === 'object') {
          const o = v as { isVector2?: boolean; isVector3?: boolean; isVector4?: boolean; isMatrix4?: boolean; isColor?: boolean; elements?: number[]; toArray?: () => number[] };
          if (o.isMatrix4) {
            if (!o.elements!.every(Number.isFinite)) ((v as THREE.Matrix4).identity(), (bad ||= k));
          } else if ((o.isVector2 || o.isVector3 || o.isVector4 || o.isColor) && !o.toArray!().every(Number.isFinite)) {
            (v as THREE.Vector4).fromArray(o.toArray!().map((x) => (Number.isFinite(x) ? x : 0)));
            bad ||= k;
          }
        }
      }
    }
    if (this.bloom && !Number.isFinite(this.bloom.intensity)) ((this.bloom.intensity = 0.75), (bad ||= 'bloom'));
    if (bad && !this.warned) {
      this.warned = true;
      console.warn(`post: non-finite uniform '${bad}' reset`);
    }
  }

  private updateSun(): void {
    this.sun ??= this.scene.getObjectByName('sunDisc') ?? null;
    if (!this.sun) {
      if (this.shafts) this.shafts.uniforms.get('strength')!.value = 0;
      if (this.lens) this.lens.uniforms.get('sunOn')!.value = 0;
      return;
    }
    const cam = this.camera as THREE.PerspectiveCamera;
    this.sunV.setFromMatrixPosition(this.sun.matrixWorld).project(cam);
    // With the sun near the lens plane its projection blows up (w → 0): keep it finite and bounded,
    // or the shafts and glare multiply 0 by Inf and one NaN pixel, spread by the bloom, blacks the frame.
    const fin = Number.isFinite(this.sunV.x) && Number.isFinite(this.sunV.y) && Number.isFinite(this.sunV.z);
    const behind = !fin || this.sunV.z > 1;
    const x = fin ? Math.min(4, Math.max(-3, this.sunV.x * 0.5 + 0.5)) : -3;
    const y = fin ? Math.min(4, Math.max(-3, this.sunV.y * 0.5 + 0.5)) : -3;
    const off = Math.max(0, Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)) - 0.5);
    if (this.shafts) {
      const u = this.shafts.uniforms;
      u.get('sunPos')!.value.set(x, y);
      u.get('strength')!.value = behind ? 0 : 1.0 * Math.max(0, 1 - off * 1.6);
    }
    if (this.lens) {
      const u = this.lens.uniforms;
      u.get('sunPos')!.value.set(x, y);
      // The flare lives only while the disc is in (or just grazing) the frame.
      const inside = Math.max(0, 1 - off * 12);
      // Without the flare (Low) the glare alone stays, and fades more gently as the sun leaves the frame.
      u.get('sunOn')!.value = behind ? 0 : this.flareOn ? inside : Math.max(0, 1 - off * 3);
    }
  }

  render(dt: number): void {
    this.updateSun();
    this.sanitize();
    // The rig moves the near plane (a far one on the title fly-over); depth-reading effects copy the
    // camera's near/far only when built, so re-copy on a change or their depth would be wrong.
    const cam = this.camera as THREE.PerspectiveCamera;
    if (cam.near !== this.near) {
      this.near = cam.near;
      for (const p of this.composer.passes) (p.fullscreenMaterial as { copyCameraSettings?: (c: THREE.Camera) => void } | null)?.copyCameraSettings?.(cam);
    }
    this.composer.render(dt);
  }
}
