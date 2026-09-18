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
  // The tuned rig takes ~1.6s to come round, and its usable window — the
  // releases that land inside the castle footprint — is ticks 332-417 on an
  // empty field. Sample generously either side of that.
  for (let t = 288; t <= 456; t += 6) releaseDelays.push(t);
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
  /** 0 (as easy as this generator gets) to 1 (only one winning timing in
   * the whole grid) — see `difficultyFromWinningFraction`. */
  difficulty: number;
  solvable: boolean;
}

/**
 * Difficulty normalisation. Measured, not assumed — the same discipline the
 * break thresholds get.
 *
 * `difficulty = 1 - winningFraction` was wrong because it implicitly
 * assumed a level could be won from most of the release grid. It cannot:
 * sweeping 40 generated candidates, the winning fraction ran
 *   min 0.00 · p25 0.03 · median 0.07 · p75 0.17 · p90 0.24 · max 0.45,
 * so the naive score pinned every shippable level between 0.55 and 1.0 and
 * nothing could ever read as easy.
 *
 * Two corrections, both taken from that measurement:
 *  - Normalise against the achievable CEILING (0.45), not against 1.
 *  - Normalise on a LOG scale, because the winning fraction is really a
 *    count of winning timings and that count is heavily skewed: going from
 *    one winning release to two roughly halves the timing precision the
 *    player needs, while 12 to 13 is imperceptible. SCALE is one winning
 *    timing on the default 29-point grid, i.e. the resolution floor.
 *
 * Together these map the measured population onto a genuinely full range:
 * 0.034 -> 0.74, 0.069 -> 0.59, 0.138 -> 0.39, 0.241 -> 0.21, 0.45 -> 0.0.
 */
export const WINNING_FRACTION_CEILING = 0.45;
const WINNING_FRACTION_SCALE = 0.035;

export function difficultyFromWinningFraction(winningFraction: number): number {
  const wf = Math.max(0, winningFraction);
  const normalised =
    Math.log1p(wf / WINNING_FRACTION_SCALE) /
    Math.log1p(WINNING_FRACTION_CEILING / WINNING_FRACTION_SCALE);
  return Math.min(1, Math.max(0, 1 - normalised));
}

/**
 * A level this many of its opening shots can clear outright is not a level.
 * The old threshold was 0.5, which the measurement above shows is
 * unreachable (the easiest of 40 candidates cleared on 0.34 of its opening
 * shots) — i.e. it was dead code. 0.30 sits at the top of the range the
 * generator actually produces and fires on roughly one candidate in forty.
 */
export const TRIVIAL_FIRST_SHOT_FRACTION = 0.3;

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
 * The winning fraction over opening shots is normalised into the difficulty
 * score (see `difficultyFromWinningFraction`), so difficulty still reads as
 * "how much of the parameter space wins", not "did the beam get lucky".
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
    difficulty: difficultyFromWinningFraction(winningFraction),
    solvable: wins > 0,
  };
}
