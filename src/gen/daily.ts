import type { RapierModule } from '../core/rapier-init';
import type { Level } from '../core/types';
import { generateLevel } from './generate';
import { evaluateLevel } from './evaluate';

/** UTC-date-derived seed, e.g. "daily-2026-08-26". Same for everyone,
 * everywhere, with no server involved. */
export function dailySeedForDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `daily-${y}-${m}-${d}`;
}

export interface DailyLevelResult {
  level: Level;
  attempts: number;
}

/**
 * Generates the daily level at runtime and runs an abbreviated validation
 * sweep before presenting it. If validation fails, increments a counter
 * into the seed and retries — deterministically, so every player who loads
 * the client on the same UTC day lands on the same level.
 */
export function buildDailyLevel(RAPIER: RapierModule, date: Date, maxAttempts = 20): DailyLevelResult {
  const baseSeed = dailySeedForDate(date);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const seed = attempt === 0 ? baseSeed : `${baseSeed}#${attempt}`;
    let level: Level;
    try {
      ({ level } = generateLevel(RAPIER, 'daily', seed, { ammo: 3 }));
    } catch {
      continue;
    }
    const evaluation = evaluateLevel(RAPIER, level, {
      releaseDelays: abbreviatedDelays(),
      massMultipliers: [1],
      maxTicksPerShot: 240 * 4,
      maxShots: 2,
    });
    if (!evaluation.solvable) continue;
    level.difficulty = evaluation.difficulty;
    level.par = Math.max(1, Math.round(evaluation.difficulty * level.ammo));
    return { level, attempts: attempt + 1 };
  }
  throw new Error(`buildDailyLevel: no solvable level found for ${baseSeed} after ${maxAttempts} attempts`);
}

function abbreviatedDelays(): number[] {
  const out: number[] = [];
  for (let t = 120; t <= 260; t += 10) out.push(t);
  return out;
}
