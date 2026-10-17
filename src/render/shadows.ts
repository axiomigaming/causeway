import * as THREE from 'three';

let installed = false;

/**
 * The sun's shadow map is a tight box that follows the runner. three ends a shadow abruptly where
 * that box ends, which draws a hard line across the causeway ahead (wall shadows that stop dead).
 * This fades the PCF shadow out over the outer `edge` of the box instead. Patches the shared shader
 * chunk once, before any program is compiled; a no-op if three's chunk no longer matches.
 */
export function installShadowEdgeFade(edge = 0.12): void {
  if (installed) return;
  installed = true;
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const pcf = chunk.indexOf('float getShadow( sampler2DShadow');
  const ret = 'return mix( 1.0, shadow, shadowIntensity );';
  const at = pcf < 0 ? -1 : chunk.indexOf(ret, pcf);
  if (at < 0) return;
  const faded = `vec2 shadowEdge = min( shadowCoord.xy, 1.0 - shadowCoord.xy );
			return mix( 1.0, shadow, shadowIntensity * smoothstep( 0.0, ${edge.toFixed(3)}, min( shadowEdge.x, shadowEdge.y ) ) );`;
  let out = chunk.slice(0, at) + faded + chunk.slice(at + ret.length);
  // Contact-hardening, roughly (a PCSS-ish light size without the blocker search): the filter
  // footprint grows with the distance from the lens, so shadows right at the runner's feet and the
  // near tiles are crisp and the far ones soft, instead of one blur everywhere. gl_FragCoord.w is
  // 1 / view depth for a perspective camera, available in every material that samples the map.
  const rad = 'float radius = shadowRadius * texelSize.x;';
  const ri = out.indexOf(rad, pcf);
  if (ri > 0) out = out.slice(0, ri) + 'float radius = shadowRadius * texelSize.x * mix( 0.55, 2.2, smoothstep( 4.0, 28.0, 1.0 / gl_FragCoord.w ) );' + out.slice(ri + rad.length);
  THREE.ShaderChunk.shadowmap_pars_fragment = out;
}
