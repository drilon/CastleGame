import type { RapierModule } from '../core/rapier-init';
import { Sim } from '../core/sim';
import type { Level } from '../core/types';
import { DEFAULT_TREBUCHET_CONFIG } from '../core/types';

export interface SweepConfig {
  /** Candidate ticks between "drop counterweight" and "release sling". */
  releaseDelays: number[];
  /** Candidate multipliers on the default counterweight mass. */
  massMultipliers: number[];
  /** Per-shot simulation cap — the "cap simulation time so generation
   * cannot hang" requirement. */
  maxTicksPerShot: number;
  /** How many shots a trial may use before it's scored a loss. */
  maxShots: number;
  /** How many distinct opening shots are carried forward into the
   * follow-up search (see `evaluateLevel`). */
  beamWidth: number;
}

export function defaultSweepConfig(maxShots: number): SweepConfig {
  const releaseDelays: number[] = [];
  // The tuned rig swings for ~0.8s, so its usable window sits around ticks
  // 170-220. Sample generously either side of that.
  for (let t = 120; t <= 260; t += 6) releaseDelays.push(t);
  return {
    releaseDelays,
    // Release timing is the ONLY thing the player controls at the moment of
    // a shot; counterweight mass is a level-authoring knob, not an in-game
    // control. Sweeping it would credit the player with agency they do not
    // have and overstate how solvable a level is.
    massMultipliers: [1],
    maxTicksPerShot: 240 * 4,
    maxShots: Math.min(maxShots, 2),
    beamWidth: 3,
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

interface Shot {
  releaseDelayTicks: number;
  massMult: number;
}

const REST_SPEED_THRESHOLD = 0.08;
const REST_GRACE_TICKS = 90;
const REST_CHECK_INTERVAL = 30;

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

/** Fires one shot on an existing sim and runs it to rest or timeout. */
function fireShot(sim: Sim, shot: Shot, maxTicks: number): void {
  sim.reloadTrebuchet({ counterweightMass: DEFAULT_TREBUCHET_CONFIG.counterweightMass * shot.massMult });
  sim.dropCounterweight();
  for (let i = 0; i < shot.releaseDelayTicks; i++) sim.step();
  sim.releaseSling();
  const start = sim.tick;
  while (sim.tick - start < maxTicks) {
    sim.step();
    if (sim.allDead) return;
    const elapsed = sim.tick - start;
    if (elapsed > REST_GRACE_TICKS && elapsed % REST_CHECK_INTERVAL === 0 && maxBodySpeed(sim) < REST_SPEED_THRESHOLD) {
      return;
    }
  }
}

/** Replays a whole sequence from a fresh world and reports what it achieved.
 * Rapier worlds can't be cheaply cloned, so exploring a follow-up shot means
 * replaying its predecessors — which is why the search is a narrow beam
 * rather than an exhaustive product over shots. */
function runSequence(RAPIER: RapierModule, level: Level, seq: Shot[], cfg: SweepConfig): { kills: number; cleared: boolean } {
  const sim = new Sim(RAPIER, level, {
    maxTicks: (cfg.maxTicksPerShot + Math.max(...cfg.releaseDelays) + 20) * seq.length + 20,
  });
  for (const shot of seq) {
    fireShot(sim, shot, cfg.maxTicksPerShot);
    if (sim.allDead) break;
  }
  return { kills: level.people.length - sim.aliveCount, cleared: sim.allDead };
}

/**
 * Sweeps shot parameters and reports how reliably the level can be cleared.
 *
 * Shots are searched as genuinely independent choices rather than one shot
 * repeated: every opening shot is scored on its own, the most damaging few
 * are carried forward (a beam), and each is extended with the full grid of
 * follow-ups. That matters because a castle with occupants on several
 * floors generally cannot be cleared by firing the same shot twice — the
 * second shot has to go somewhere else.
 *
 * The winning fraction over opening shots is inverted into the difficulty
 * score, so difficulty still reads as "how much of the parameter space
 * wins", not "did the beam get lucky".
 */
export function evaluateLevel(RAPIER: RapierModule, level: Level, sweep?: Partial<SweepConfig>): EvaluationResult {
  const cfg = { ...defaultSweepConfig(level.ammo), ...sweep };

  const openings: Shot[] = [];
  for (const releaseDelayTicks of cfg.releaseDelays) {
    for (const massMult of cfg.massMultipliers) openings.push({ releaseDelayTicks, massMult });
  }

  // Phase 1 — score every opening shot on its own.
  let firstShotWins = 0;
  const scoredOpenings = openings.map((shot) => {
    const r = runSequence(RAPIER, level, [shot], cfg);
    if (r.cleared) firstShotWins++;
    return { shot, ...r };
  });

  let wins = firstShotWins;

  // Phase 2 — extend the most damaging openings that did not already win
  // with a genuinely different second shot. Every follow-up has to replay
  // its opening from scratch (Rapier worlds don't clone), so this is by far
  // the expensive half and is kept to a narrow beam of two-shot sequences.
  // A level verified here is solvable in two shots; levels ship with a
  // spare round on top of that.
  if (cfg.maxShots > 1) {
    const beam = scoredOpenings
      .filter((o) => !o.cleared)
      .sort((a, b) => b.kills - a.kills)
      .slice(0, cfg.beamWidth);

    for (const opening of beam) {
      for (const follow of openings) {
        if (runSequence(RAPIER, level, [opening.shot, follow], cfg).cleared) {
          wins++;
          break;
        }
      }
    }
  }

  const trials = openings.length;
  const winningFraction = wins / trials;
  return {
    trials,
    wins,
    winningFraction,
    firstShotWinFraction: firstShotWins / trials,
    difficulty: Math.min(1, Math.max(0, 1 - winningFraction)),
    solvable: wins > 0,
  };
}
