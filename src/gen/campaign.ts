import type { RapierModule } from '../core/rapier-init';
import type { Archetype, Level } from '../core/types';
import { generateLevel } from './generate';
import { evaluateLevel } from './evaluate';
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
}

/**
 * Builds one validated, difficulty-sorted campaign pack from a seed. Each
 * candidate level is generated, settle-checked (inside `generateLevel`),
 * then swept by the validator; only solvable, non-trivial candidates are
 * kept. This is the same pipeline `tools/gen-campaigns.ts` runs at build
 * time and the daily seed runs (abbreviated) at runtime — see `daily.ts`.
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
  let candidatesTried = 0;

  for (let i = 0; candidatesTried < maxCandidates && scored.length < levelCount; i++) {
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
    if (!evaluation.solvable) continue;
    if (evaluation.firstShotWinFraction > 0.5) continue; // trivially easy
    level.difficulty = evaluation.difficulty;
    level.par = Math.max(1, Math.round(evaluation.difficulty * ammo));
    scored.push({ level, difficulty: evaluation.difficulty });
  }

  scored.sort((a, b) => a.difficulty - b.difficulty);
  const levels = scored.map((s, i) => ({ ...s.level, id: `${packId}-${i}` }));

  return { pack: { id: packId, theme, levels }, candidatesTried };
}
