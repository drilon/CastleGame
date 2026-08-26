import RAPIER from '@dimforge/rapier2d-compat';

let initPromise: Promise<typeof RAPIER> | null = null;

/**
 * Rapier ships as WASM and needs a one-time async init before any of its
 * classes can be constructed. Callers (browser main.ts, Node tools/tests
 * alike) must await this before touching anything else in `src/core`.
 */
export function initPhysics(): Promise<typeof RAPIER> {
  if (!initPromise) {
    initPromise = RAPIER.init().then(() => RAPIER);
  }
  return initPromise;
}

export type RapierModule = typeof RAPIER;
export default RAPIER;
