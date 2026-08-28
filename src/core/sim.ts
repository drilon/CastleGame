import type RAPIER from '@dimforge/rapier2d-compat';
import type { RapierModule } from './rapier-init';
import type { Level, TrebuchetConfig } from './types';
import { DEFAULT_TREBUCHET_CONFIG } from './types';
import { buildWorld, type SimWorld } from './world';
import { buildTrebuchet, dropCounterweight, releaseSling, slingAnchorWorld, type TrebuchetRig } from './trebuchet';
import { armPersonColliders, applyKillModel } from './kill';
import { breakOverstressedJoints, snapshotBlockVelocities } from './breakable';
import { poseOf, type RenderSnapshot } from './snapshot';

/** Fixed physics step. Everything gameplay-relevant (release timing, impulse
 * thresholds) is tuned against this — never vary it at runtime. */
export const FIXED_DT = 1 / 240;

/** Where the machine stands. The castle grammar builds from x=0 rightward,
 * so this is also the standoff distance the trebuchet is tuned against. */
export const TREBUCHET_ORIGIN = { x: -7, y: 6.5 };

export interface SimOptions {
  gravity?: { x: number; y: number };
  trebuchet?: Partial<TrebuchetConfig>;
  /** Safety valve for headless sweeps (validator/tools) — stops step() from
   * spinning forever on a scenario that never settles. */
  maxTicks?: number;
}

export class Sim {
  readonly level: Level;
  readonly world: SimWorld;
  rig: TrebuchetRig;
  readonly gravity: { x: number; y: number };
  readonly maxTicks: number;
  tick = 0;
  private readonly RAPIER: RapierModule;
  private readonly trebConfig: TrebuchetConfig;
  private accumulator = 0;
  private eventQueue: RAPIER.EventQueue;
  private ended = false;

  constructor(RAPIER: RapierModule, level: Level, options: SimOptions = {}) {
    this.RAPIER = RAPIER;
    this.level = level;
    this.gravity = options.gravity ?? { x: 0, y: -20 };
    this.maxTicks = options.maxTicks ?? 240 * 40;
    this.world = buildWorld(RAPIER, level, this.gravity);
    armPersonColliders(RAPIER, this.world);
    this.trebConfig = {
      x: TREBUCHET_ORIGIN.x,
      y: TREBUCHET_ORIGIN.y,
      ...DEFAULT_TREBUCHET_CONFIG,
      ...options.trebuchet,
    };
    this.rig = buildTrebuchet(RAPIER, this.world.world, this.trebConfig);
    this.eventQueue = new RAPIER.EventQueue(true);
  }

  dropCounterweight(): boolean {
    return dropCounterweight(this.RAPIER, this.rig);
  }

  releaseSling(): boolean {
    return releaseSling(this.world.world, this.rig);
  }

  /** Tears down the current trebuchet rig and builds a fresh cocked one in
   * its place, optionally with a different counterweight mass — used to
   * fire consecutive shots within one ammo budget (validator, and a player
   * who hasn't run out of shots). The castle and everyone in it carry over
   * untouched. */
  reloadTrebuchet(overrides: Partial<TrebuchetConfig> = {}): void {
    const bodies = [this.rig.base, this.rig.arm, this.rig.counterweight, this.rig.payload];
    for (const body of bodies) this.world.world.removeRigidBody(body);
    Object.assign(this.trebConfig, overrides);
    this.rig = buildTrebuchet(this.RAPIER, this.world.world, this.trebConfig);
  }

  /** Advances exactly one fixed tick. Pure function of current state — same
   * state in implies same state out, on any platform. */
  step(): void {
    if (this.ended) return;
    const before = snapshotBlockVelocities(this.world);
    this.world.world.step(this.eventQueue);
    breakOverstressedJoints(this.world, before, FIXED_DT, this.gravity);
    applyKillModel(this.world, this.eventQueue, FIXED_DT);
    this.tick++;
    if (this.tick >= this.maxTicks) this.ended = true;
  }

  stepN(n: number): void {
    for (let i = 0; i < n && !this.ended; i++) this.step();
  }

  /** Real-time driver: call once per render frame with elapsed seconds.
   * Runs zero or more fixed ticks to catch up, decoupling simulation rate
   * from display rate. */
  advance(realDtSeconds: number): void {
    this.accumulator += Math.min(realDtSeconds, 0.25);
    while (this.accumulator >= FIXED_DT && !this.ended) {
      this.step();
      this.accumulator -= FIXED_DT;
    }
  }

  /** Fraction of a tick elapsed since the last physics step — for the
   * renderer to interpolate between the last two snapshots. */
  get interpolationAlpha(): number {
    return this.accumulator / FIXED_DT;
  }

  get isOver(): boolean {
    return this.ended || this.allDead;
  }

  get allDead(): boolean {
    return this.world.people.length > 0 && this.world.people.every((p) => !p.alive);
  }

  get aliveCount(): number {
    return this.world.people.filter((p) => p.alive).length;
  }

  /** Midpoint/orientation of the taut-or-slack sling line, for rendering. */
  private slingSegmentPose(): { x: number; y: number; angle: number; length: number } {
    const a = slingAnchorWorld(this.rig);
    const b = this.rig.payload.translation();
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      length: Math.hypot(b.x - a.x, b.y - a.y),
    };
  }

  snapshot(): RenderSnapshot {
    return {
      tick: this.tick,
      blocks: this.world.blocks.map((b) => ({
        id: b.id,
        material: b.material,
        detached: b.detached,
        w: b.w,
        h: b.h,
        ...poseOf(b.body),
      })),
      people: this.world.people.map((p) => ({ id: p.id, alive: p.alive, ...poseOf(p.body) })),
      trebuchet: {
        arm: poseOf(this.rig.arm),
        counterweight: poseOf(this.rig.counterweight),
        // The sling is a rope constraint, not a chain of bodies, so its
        // visual is derived from its two endpoints. Once released there is
        // no sling to draw.
        sling: this.rig.releaseJoint ? [this.slingSegmentPose()] : [],
        payload: poseOf(this.rig.payload),
        phase: this.rig.phase,
      },
    };
  }
}
