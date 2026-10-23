/**
 * World round 19: QA parameters for the world, read the same way in dev and in production builds.
 * They are honoured in a dev build, or in any build opened with `?qa` (the flag that also exposes the
 * game to the capture tools), so a capture of `?qa&w=7` shows the same world on every build.
 * All of them are presentation only: none can see or change the round's outcome.
 */
const params: URLSearchParams | null =
  typeof location !== 'undefined' && (import.meta.env.DEV || new URLSearchParams(location.search).has('qa')) ? new URLSearchParams(location.search) : null;

/** A QA parameter's value, or null (not given, or QA is off). */
export function qaParam(name: string): string | null {
  return params?.get(name) ?? null;
}

export function qaHas(name: string): boolean {
  return params?.has(name) ?? false;
}

/**
 * `?w=<n>`: the world seed, explicit. Every world built while it is set (the title's and each round's)
 * is this one, whatever came before it: the plan (theme, look, style) and the route come from it alone.
 * (The string matches what the capture scripts' clock stub produced before round 19, so earlier
 * captures of `?w=<n>` still show the same world.)
 */
export function qaWorldSeed(): string | null {
  const w = qaParam('w');
  return w === null || w === '' ? null : `${w}-0.5`;
}
