import { describe, expect, it, beforeAll } from 'vitest';
import { initPhysics } from '../src/core/rapier-init';
import { Sim } from '../src/core/sim';
import type { RapierModule } from '../src/core/rapier-init';
import type { Level } from '../src/core/types';
import { MATERIALS } from '../src/core/materials';
import { simpleStackLevel } from './fixtures';

let RAPIER: RapierModule;

beforeAll(async () => {
  RAPIER = await initPhysics();
});

describe('kill model', () => {
  it('kills a person hit hard enough, and a light contact does not', () => {
    const level: Level = {
      id: 'kill-test',
      seed: 'kill-test',
      archetype: 'tower',
      blocks: [],
      people: [{ x: 0, y: 0.56 }],
      ammo: 1,
      par: 1,
      difficulty: 0,
    };
    const sim = new Sim(RAPIER, level, { maxTicks: 500 });
    sim.dropCounterweight();
    sim.releaseSling();
    // Force a hard, direct downward strike to isolate the kill model from
    // trebuchet aim.
    sim.rig.payload.setTranslation({ x: 0, y: 3 }, true);
    sim.rig.payload.setLinvel({ x: 0, y: -40 }, true);

    expect(sim.aliveCount).toBe(1);
    for (let i = 0; i < 20 && sim.aliveCount > 0; i++) sim.step();
    expect(sim.aliveCount).toBe(0);
  });
});

describe('breakable joints', () => {
  it('snaps a joint between blocks under a strong enough impulse', () => {
    const level: Level = {
      id: 'break-test',
      seed: 'break-test',
      archetype: 'tower',
      blocks: [
        { x: 0, y: 0.5, w: 1, h: 1, angle: 0, material: 'wood' },
        { x: 0, y: 1.5, w: 1, h: 1, angle: 0, material: 'wood' },
      ],
      people: [],
      ammo: 1,
      par: 1,
      difficulty: 0,
    };
    const sim = new Sim(RAPIER, level, { maxTicks: 500 });
    expect(sim.world.joints.length).toBe(1);
    expect(sim.world.joints[0]!.broken).toBe(false);

    // A hard but physically sane strike: a 1x1 wood block masses ~0.6kg,
    // so 60 m/s carries ~36 N*s — comfortably over wood's 15 N*s threshold
    // and far under steel's 5000.
    const top = sim.world.blocks[1]!.body;
    top.setLinvel({ x: 0, y: -60 }, true);
    for (let i = 0; i < 10; i++) sim.step();

    expect(sim.world.joints[0]!.broken).toBe(true);
  });

  it('never breaks a steel joint under the same impulse that snaps wood', () => {
    const level: Level = {
      id: 'steel-test',
      seed: 'steel-test',
      archetype: 'tower',
      blocks: [
        { x: 0, y: 0.5, w: 1, h: 1, angle: 0, material: 'steel' },
        { x: 0, y: 1.5, w: 1, h: 1, angle: 0, material: 'steel' },
      ],
      people: [],
      ammo: 1,
      par: 1,
      difficulty: 0,
    };
    const sim = new Sim(RAPIER, level, { maxTicks: 500 });
    // Same strike that snaps wood above; steel is ~13x denser and its
    // threshold is far higher, so it must hold.
    const top = sim.world.blocks[1]!.body;
    top.setLinvel({ x: 0, y: -60 }, true);
    for (let i = 0; i < 10; i++) sim.step();

    expect(sim.world.joints[0]!.broken).toBe(false);
  });
});

describe('impulse calibration', () => {
  /** The original "physics is broken" bug: break thresholds were set ~20-50x
   * above any impulse the simulation actually produces, so no joint could
   * ever fail and castles toppled as one welded rigid body. These lock the
   * thresholds to the same scale as real in-game events. */
  it('keeps break thresholds within the impulse range the sim produces', () => {
    // Measured regimes: settling ~1 N*s, falling masonry ~27, direct hit 64-91.
    for (const m of ['ice', 'wood', 'stone'] as const) {
      expect(MATERIALS[m].breakImpulse).toBeGreaterThan(2); // survives settling
      expect(MATERIALS[m].breakImpulse).toBeLessThan(95); // reachable by a real hit
    }
    // Brittleness ordering must hold: ice fails first, steel effectively never.
    expect(MATERIALS.ice.breakImpulse).toBeLessThan(MATERIALS.wood.breakImpulse);
    expect(MATERIALS.wood.breakImpulse).toBeLessThan(MATERIALS.stone.breakImpulse);
    expect(MATERIALS.steel.breakImpulse).toBeGreaterThan(1000);
  });

  it('fragments a struck castle locally instead of toppling it as one mass', () => {
    const level = simpleStackLevel();
    const sim = new Sim(RAPIER, level, { maxTicks: 240 * 12 });
    const totalJoints = sim.world.joints.length;
    expect(totalJoints).toBeGreaterThan(0);

    // A release timing that connects with this fixture's stack (the rig
    // swings for ~0.8s, so useful releases live around tick 180-220).
    sim.dropCounterweight();
    for (let i = 0; i < 200; i++) sim.step();
    sim.releaseSling();
    for (let i = 0; i < 240 * 6; i++) sim.step();

    const broken = sim.world.joints.filter((j) => j.broken).length;
    expect(broken).toBeGreaterThan(0);
    // ...but not everything at once — failure should be local, not total.
    expect(broken).toBeLessThan(totalJoints);
    // And the collapse has to actually be lethal, or the level is unwinnable.
    expect(sim.aliveCount).toBeLessThan(level.people.length);
  });
});
