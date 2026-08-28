import type RAPIER from '@dimforge/rapier2d-compat';
import type { RapierModule } from './rapier-init';
import type { SimWorld } from './world';

/**
 * Lethal velocity change, in m/s, accumulated on a person's body over a
 * single tick.
 *
 * This is deliberately a delta-v and not a raw impulse. Impulse scales with
 * the victim's mass, and a person body here masses well under a kilogram,
 * so an absolute newton-second threshold is unreachable no matter how hard
 * they are hit — which is exactly why an earlier absolute threshold left
 * people standing unharmed inside collapsing towers. Delta-v is
 * mass-independent and is also the better injury proxy: what hurts is
 * being accelerated, not absorbing momentum.
 *
 * Calibrated against measured behaviour: standing still is ~0.08 m/s per
 * tick, a survivable short drop is ~3-4, and being caught by collapsing
 * masonry runs 10-200.
 */
export const KILL_DELTA_V = 10;

/** Below this contact force, no event is even reported — this filters out
 * resting contacts (a person's own weight is far below it). */
const CONTACT_FORCE_EVENT_THRESHOLD = 15;

export function armPersonColliders(RAPIER: RapierModule, sim: SimWorld): void {
  for (const person of sim.people) {
    person.collider.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
    person.collider.setContactForceEventThreshold(CONTACT_FORCE_EVENT_THRESHOLD);
  }
}

/** Reads accumulated contact-force events for the tick just simulated and
 * kills anyone whose total velocity change this tick exceeded the
 * threshold. Falling masonry counts; resting contact never does, because a
 * body at rest under load changes velocity by essentially nothing. */
export function applyKillModel(sim: SimWorld, eventQueue: RAPIER.EventQueue, dt: number): number[] {
  for (const person of sim.people) person.tickImpulse = 0;

  const colliderToPerson = new Map<number, number>();
  sim.people.forEach((p, i) => colliderToPerson.set(p.collider.handle, i));

  eventQueue.drainContactForceEvents((event) => {
    const impulse = event.totalForceMagnitude() * dt;
    const i1 = colliderToPerson.get(event.collider1());
    const i2 = colliderToPerson.get(event.collider2());
    if (i1 !== undefined) sim.people[i1]!.tickImpulse += impulse;
    if (i2 !== undefined) sim.people[i2]!.tickImpulse += impulse;
  });

  const newlyDead: number[] = [];
  for (const person of sim.people) {
    if (!person.alive) continue;
    const mass = person.body.mass();
    const deltaV = mass > 0 ? person.tickImpulse / mass : 0;
    if (deltaV > KILL_DELTA_V) {
      person.alive = false;
      newlyDead.push(person.index);
    }
  }
  return newlyDead;
}
