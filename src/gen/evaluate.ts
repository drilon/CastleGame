import type { RapierModule } from '../core/rapier-init';
import { Sim } from '../core/sim';
import type { Level } from '../core/types';
import { DEFAULT_TREBUCHET_CONFIG } from '../core/types';

export interface ShotParams {
  releaseDelayTicks: number;
  counterweightMassMult: number;
}

export interface SweepConfig {
  /** Candidate ticks between "drop counterweight" and "release sling". */
  releaseDelays: number[];
  /** Candidate multipliers on the default counterweight mass. */
  massMultipliers: number[];
  /** Per-shot simulation cap — the "cap simulation time so generation
   * cannot hang" requirement. */
  maxTicksPerShot: number;
  /** How many shots (reloading the trebuchet each time) a trial may use
   * before it's scored a loss — normally the level's ammo count. */
  maxShots: number;
}

export function defaultSweepConfig(maxShots: number): SweepConfig {
  const releaseDelays: number[] = [];
  for (let t = 20; t <= 140; t += 6) releaseDelays.push(t);
  return {
    releaseDelays,
    massMultipliers: [0.85, 1.15],
    maxTicksPerShot: 240 * 2.5,
    maxShots: Math.min(maxShots, 2),
  };
}

export interface EvaluationResult {
  trials: number;
  wins: number;
  winningFraction: number;
  /** Fraction of trials that cleared the level on the very first shot —
   * used to reject levels that are trivially easy. */
  firstShotWinFraction: number;
  /** 0 (trivial) to 1 (hardest seen) — the inverted, normalised winning
   * fraction. */
  difficulty: number;
  solvable: boolean;
}

const REST_CHECK_INTERVAL = 60;
const REST_SPEED_THRESHOLD = 0.08;
const REST_GRACE_TICKS = 90;

function maxBodySpeed(sim: Sim): number {
  let max = 0;
  for (const b of sim.world.blocks) {
    const v = b.body.linvel();
    const s = Math.hypot(v.x, v.y);
    if (s > max) max = s;
  }
  const pv = sim.rig.payload.linvel();
  const ps = Math.hypot(pv.x, pv.y);
  if (ps > max) max = ps;
  return max;
}

/** Runs one already-released shot until every body's speed drops under the
 * rest threshold, or the per-shot tick cap is hit. */
function runShotToRestOrTimeout(sim: Sim, maxTicks: number): void {
  const startTick = sim.tick;
  while (sim.tick - startTick < maxTicks) {
    sim.step();
    const elapsed = sim.tick - startTick;
    if (elapsed > REST_GRACE_TICKS && elapsed % REST_CHECK_INTERVAL === 0) {
      if (maxBodySpeed(sim) < REST_SPEED_THRESHOLD) return;
    }
    if (sim.allDead) return;
  }
}

/**
 * Sweeps a grid of (release timing, counterweight mass) shot parameters.
 * Each grid point is one trial: fire that same shot up to `maxShots` times
 * (reloading the trebuchet between shots, castle damage carrying over)
 * and see if everyone dies before running out. The winning fraction across
 * the whole grid is inverted into a difficulty score.
 *
 * Scope note: this searches *repeating the same shot*, not independently
 * varying every shot in a multi-shot sequence — a full combinatorial
 * search across shots is future work (see README). It's still a faithful
 * measure of "is there a shot a player can lean on to clear this level".
 */
export function evaluateLevel(RAPIER: RapierModule, level: Level, sweep?: Partial<SweepConfig>): EvaluationResult {
  const cfg = { ...defaultSweepConfig(level.ammo), ...sweep };
  let wins = 0;
  let firstShotWins = 0;
  let trials = 0;

  for (const releaseDelayTicks of cfg.releaseDelays) {
    for (const counterweightMassMult of cfg.massMultipliers) {
      trials++;
      const sim = new Sim(RAPIER, level, {
        trebuchet: { counterweightMass: DEFAULT_TREBUCHET_CONFIG.counterweightMass * counterweightMassMult },
        maxTicks: cfg.maxShots * (cfg.maxTicksPerShot + cfg.releaseDelays[cfg.releaseDelays.length - 1]! + 10) + 10,
      });
      let won = false;
      for (let shot = 1; shot <= cfg.maxShots; shot++) {
        sim.dropCounterweight();
        for (let i = 0; i < releaseDelayTicks; i++) sim.step();
        sim.releaseSling();
        runShotToRestOrTimeout(sim, cfg.maxTicksPerShot);
        if (sim.allDead) {
          won = true;
          if (shot === 1) firstShotWins++;
          break;
        }
        if (shot < cfg.maxShots) sim.reloadTrebuchet({ counterweightMass: DEFAULT_TREBUCHET_CONFIG.counterweightMass * counterweightMassMult });
      }
      if (won) wins++;
    }
  }

  const winningFraction = wins / trials;
  const firstShotWinFraction = firstShotWins / trials;
  return {
    trials,
    wins,
    winningFraction,
    firstShotWinFraction,
    difficulty: Math.min(1, Math.max(0, 1 - winningFraction)),
    solvable: wins > 0,
  };
}
