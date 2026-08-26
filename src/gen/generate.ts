import type { RapierModule } from '../core/rapier-init';
import type { Archetype, Level } from '../core/types';
import { rngFromSeed, pick } from '../core/rng';
import { ARCHETYPES, ARCHETYPE_LIST } from './archetypes';
import { hasBadOverlaps, checkSettles } from './settle';

export interface GenerateOptions {
  archetype?: Archetype;
  ammo?: number;
  maxAttempts?: number;
}

export interface GenerateResult {
  level: Level;
  attempts: number;
}

/**
 * Deterministically builds a level from a seed string: picks an archetype,
 * resolves its placement grammar, and settle-checks the result, retrying
 * with a derived seed on overlap or instability. The seed stored on the
 * returned level is the one that actually succeeded, so re-running
 * `generateLevel` with that stored seed reproduces the same level in one
 * attempt — this is what lets the daily seed and the campaign JSON both
 * regenerate identically from a seed alone.
 */
export function generateLevel(RAPIER: RapierModule, id: string, seed: string, options: GenerateOptions = {}): GenerateResult {
  const maxAttempts = options.maxAttempts ?? 24;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptSeed = attempt === 0 ? seed : `${seed}#${attempt}`;
    const rng = rngFromSeed(attemptSeed);
    const archetype = options.archetype ?? pick(rng, ARCHETYPE_LIST);
    const structure = ARCHETYPES[archetype](rng);
    if (hasBadOverlaps(structure.blocks, structure.people)) continue;
    if (structure.people.length === 0) continue;
    const settle = checkSettles(RAPIER, structure.blocks, structure.people);
    if (!settle.stable) continue;
    const level: Level = {
      id,
      seed: attemptSeed,
      archetype,
      blocks: structure.blocks,
      people: structure.people,
      ammo: options.ammo ?? 3,
      par: 0,
      difficulty: 0,
    };
    return { level, attempts: attempt + 1 };
  }
  throw new Error(`generateLevel: no stable structure found for seed "${seed}" after ${maxAttempts} attempts`);
}
