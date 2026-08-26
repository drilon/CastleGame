import type RAPIER from '@dimforge/rapier2d-compat';
import type { RapierModule } from './rapier-init';
import type { SimWorld } from './world';

/** Newton-seconds of contact impulse a person can absorb in one tick before dying. */
export const KILL_IMPULSE_THRESHOLD = 20;

/** Below this, contacts aren't even reported (settling bodies, footsteps). */
const CONTACT_FORCE_EVENT_THRESHOLD = 15;

export function armPersonColliders(RAPIER: RapierModule, sim: SimWorld): void {
  for (const person of sim.people) {
    person.collider.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
    person.collider.setContactForceEventThreshold(CONTACT_FORCE_EVENT_THRESHOLD);
  }
}

/** Reads accumulated contact-force events for the tick just simulated and
 * kills anyone whose total impulse this tick exceeded the threshold.
 * Contact alone does not kill — the force magnitude has to clear the bar,
 * which a resting person's own weight never does. */
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
    if (person.alive && person.tickImpulse > KILL_IMPULSE_THRESHOLD) {
      person.alive = false;
      newlyDead.push(person.index);
    }
  }
  return newlyDead;
}
