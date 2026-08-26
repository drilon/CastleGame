import type { SimWorld } from './world';

/**
 * Rapier's JS bindings (as of rapier2d-compat 0.20) don't expose a joint's
 * accumulated constraint impulse for readback — only the Rust core has it.
 * Since our fixed joints have `contactsEnabled(false)` between the pair
 * they connect, a block's momentum change over a tick, net of gravity, is
 * exactly the impulse its joints (and any other contacts, e.g. a direct
 * hit from the projectile) imparted on it. We use that as the break
 * signal: any joint touching a block whose net impulse this tick exceeded
 * the joint's threshold snaps. A block hit hard enough to break one joint
 * may break siblings too in the same tick, which is an acceptable (and
 * fairly realistic) reading of "the shock traveled through the block."
 */
export interface BlockImpulseSnapshot {
  linvelX: Float64Array;
  linvelY: Float64Array;
}

export function snapshotBlockVelocities(sim: SimWorld): BlockImpulseSnapshot {
  const n = sim.blocks.length;
  const linvelX = new Float64Array(n);
  const linvelY = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const v = sim.blocks[i]!.body.linvel();
    linvelX[i] = v.x;
    linvelY[i] = v.y;
  }
  return { linvelX, linvelY };
}

export function breakOverstressedJoints(
  sim: SimWorld,
  before: BlockImpulseSnapshot,
  dt: number,
  gravity: { x: number; y: number },
): number {
  const n = sim.blocks.length;
  const impulse = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const block = sim.blocks[i]!;
    if (block.detached) continue;
    const v = block.body.linvel();
    const m = block.body.mass();
    const dpx = m * (v.x - before.linvelX[i]!) - m * gravity.x * dt;
    const dpy = m * (v.y - before.linvelY[i]!) - m * gravity.y * dt;
    impulse[i] = Math.hypot(dpx, dpy);
  }

  let brokenCount = 0;
  for (const joint of sim.joints) {
    if (joint.broken) continue;
    if (impulse[joint.blockA]! > joint.breakImpulse || impulse[joint.blockB]! > joint.breakImpulse) {
      sim.world.removeImpulseJoint(joint.joint, true);
      joint.broken = true;
      brokenCount++;
    }
  }

  if (brokenCount > 0) {
    const liveJointCount = new Array<number>(n).fill(0);
    for (const joint of sim.joints) {
      if (joint.broken) continue;
      liveJointCount[joint.blockA]!++;
      liveJointCount[joint.blockB]!++;
    }
    for (let i = 0; i < n; i++) {
      sim.blocks[i]!.detached = liveJointCount[i] === 0;
    }
  }

  return brokenCount;
}
