import type { RapierModule } from '../core/rapier-init';
import type { Archetype, Level } from '../core/types';
import { generateLevel } from './generate';
import { evaluateLevel, TRIVIAL_FIRST_SHOT_FRACTION } from './evaluate';
import { pick, rngFromSeed } from '../core/rng';
import { ARCHETYPE_LIST } from './archetypes';

export interface CampaignPack {
  id: string;
  theme: string;
  levels: Level[];
}

export interface BuildPackOptions {
  levelCount?: number;
  ammo?: number;
  /** Upper bound on candidate seeds tried — generation + settling + a full
   * validator sweep is expensive, and most candidates get rejected (either
   * unstable or, per the validator, unsolvable/trivial), so this needs
   * real headroom rather than the handful of retries a single level uses. */
  maxCandidates?: number;
  onProgress?: (candidatesTried: number, levelsFound: number) => void;
}

export interface BuildPackResult {
  pack: CampaignPack;
  candidatesTried: number;
  /** Every solvable candidate's difficulty, in the order found — the pool
   * the shipped 15 were drawn from. Reported by `gen-campaigns`. */
  poolDifficulties: number[];
  rejectedTrivial: number;
  rejectedUnsolvable: number;
}

/**
 * Builds one validated, difficulty-sorted campaign pack from a seed. Each
 * candidate level is generated, settle-checked (inside `generateLevel`),
 * then swept by the validator; only solvable, non-trivial candidates are
 * kept. This is the same pipeline `tools/gen-campaigns.ts` runs at build
 * time and the daily seed runs (abbreviated) at runtime — see `daily.ts`.
 *
 * Candidates are pooled rather than taken first-come. Keeping the first
 * `levelCount` acceptable candidates ships whatever difficulties the
 * generator happened to emit first, which is why earlier packs opened on
 * levels as hard as their finale. Instead this gathers a pool of about
 * twice the pack size (bounded by `maxCandidates`) and takes an even
 * spread across it by quantile, so level 1 really is the gentlest of the
 * pool and level 15 the hardest. It stays deterministic from the pack
 * seed: candidate order comes from `packRng`, and the selection is a pure
 * function of the sorted pool.
 */
export function buildCampaignPack(
  RAPIER: RapierModule,
  packId: string,
  theme: string,
  seed: string,
  options: BuildPackOptions = {},
): BuildPackResult {
  const levelCount = options.levelCount ?? 15;
  const ammo = options.ammo ?? 3;
  const maxCandidates = options.maxCandidates ?? 400;

  const packRng = rngFromSeed(seed);
  const scored: { level: Level; difficulty: number }[] = [];
  const poolTarget = Math.max(levelCount, Math.min(maxCandidates, levelCount * 2));
  let candidatesTried = 0;
  let rejectedTrivial = 0;
  let rejectedUnsolvable = 0;

  for (let i = 0; candidatesTried < maxCandidates && scored.length < poolTarget; i++) {
    candidatesTried++;
    options.onProgress?.(candidatesTried, scored.length);
    const candidateSeed = `${seed}:${i}`;
    const archetype = pick(packRng, ARCHETYPE_LIST) as Archetype;
    let level: Level;
    try {
      ({ level } = generateLevel(RAPIER, `${packId}-${scored.length}`, candidateSeed, { archetype, ammo }));
    } catch {
      continue;
    }
    const evaluation = evaluateLevel(RAPIER, level);
    if (!evaluation.solvable) {
      rejectedUnsolvable++;
      continue;
    }
    if (evaluation.firstShotWinFraction > TRIVIAL_FIRST_SHOT_FRACTION) {
      rejectedTrivial++;
      continue;
    }
    level.difficulty = evaluation.difficulty;
    level.par = Math.max(1, Math.round(evaluation.difficulty * ammo));
    scored.push({ level, difficulty: evaluation.difficulty });
  }

  scored.sort((a, b) => a.difficulty - b.difficulty);
  const chosen = quantileSpread(scored, levelCount);
  const levels = chosen.map((s, i) => ({ ...s.level, id: `${packId}-${i}` }));

  return {
    pack: { id: packId, theme, levels },
    candidatesTried,
    poolDifficulties: scored.map((s) => s.difficulty),
    rejectedTrivial,
    rejectedUnsolvable,
  };
}

/**
 * Picks `count` items evenly spaced through an already-sorted pool: the
 * easiest, the hardest, and evenly spaced quantiles between. Deterministic,
 * and never returns the same pool entry twice (it walks forward instead).
 */
function quantileSpread<T>(sorted: T[], count: number): T[] {
  if (sorted.length <= count) return sorted.slice();
  const out: T[] = [];
  let last = -1;
  for (let i = 0; i < count; i++) {
    const target = Math.round((i * (sorted.length - 1)) / (count - 1));
    const index = Math.max(target, last + 1);
    // Never run off the end: leave room for the picks still to come.
    const clamped = Math.min(index, sorted.length - (count - i));
    out.push(sorted[clamped]!);
    last = clamped;
  }
  return out;
}
