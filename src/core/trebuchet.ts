import type RAPIER from '@dimforge/rapier2d-compat';
import type { RapierModule } from './rapier-init';
import type { TrebuchetConfig } from './types';
import { trebuchetId } from './entities';

export type TrebuchetPhase = 'cocked' | 'swinging' | 'released';

const ARM_THICKNESS = 0.22;
const COUNTERWEIGHT_SIZE = 0.9;
/** Radians below the +x axis the long arm starts at — mostly-down, slightly
 * forward, so the counterweight hangs high behind the pivot ready to fall. */
const COCK_ANGLE = -1.396; // -80deg

export interface TrebuchetRig {
  base: RAPIER.RigidBody;
  arm: RAPIER.RigidBody;
  counterweight: RAPIER.RigidBody;
  slingSegments: RAPIER.RigidBody[];
  payload: RAPIER.RigidBody;
  payloadCollider: RAPIER.Collider;
  releaseJoint: RAPIER.ImpulseJoint | null;
  phase: TrebuchetPhase;
  shortArm: number;
  longArm: number;
  pivot: { x: number; y: number };
}

export function buildTrebuchet(RAPIER: RapierModule, world: RAPIER.World, config: TrebuchetConfig): TrebuchetRig {
  const shortArm = config.armLength / (1 + config.armRatio);
  const longArm = shortArm * config.armRatio;
  const pivot = { x: config.x, y: config.y };
  const dir = { x: Math.cos(COCK_ANGLE), y: Math.sin(COCK_ANGLE) };

  const base = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pivot.x, pivot.y));
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, pivot.y / 2).setTranslation(0, -pivot.y / 2), base);

  // Arm spans [-shortArm, +longArm] along its local x axis; local origin is the pivot.
  const arm = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(pivot.x, pivot.y)
      .setRotation(COCK_ANGLE)
      .setAngularDamping(0.15)
      .setLinearDamping(0.05),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid((longArm + shortArm) / 2, ARM_THICKNESS / 2)
      .setTranslation((longArm - shortArm) / 2, 0)
      .setDensity(7.8)
      .setFriction(0.3),
    arm,
  );
  world.createImpulseJoint(RAPIER.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }), base, arm, true);

  // Counterweight hangs freely from the short-arm end.
  const shortTip = { x: pivot.x - shortArm * dir.x, y: pivot.y - shortArm * dir.y };
  const counterweight = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(shortTip.x, shortTip.y)
      .setAngularDamping(0.3)
      .setLinearDamping(0.05),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(COUNTERWEIGHT_SIZE / 2, COUNTERWEIGHT_SIZE / 2)
      .setDensity(1)
      .setMass(config.counterweightMass)
      .setFriction(0.5),
    counterweight,
  );
  world.createImpulseJoint(
    RAPIER.JointData.revolute({ x: -shortArm, y: 0 }, { x: 0, y: 0 }),
    arm,
    counterweight,
    true,
  );

  // Sling: a short chain hanging straight down from the long-arm tip, ending
  // in the payload. Segments are dynamic from t=0 (they just hang under the
  // frozen arm until the player drops the counterweight) so the chain settles
  // taut before the level is presented.
  const longTip = { x: pivot.x + longArm * dir.x, y: pivot.y + longArm * dir.y };
  // Guard against a config (short pivot, long sling) that would hang the
  // payload below the ground plane at spawn.
  const slingLength = Math.min(config.slingLength, Math.max(0.3, longTip.y - config.payloadRadius - 0.1));
  const segLen = slingLength / config.slingSegments;
  const segments: RAPIER.RigidBody[] = [];
  let prevBody: RAPIER.RigidBody = arm;
  let prevLocalAnchor = { x: longArm, y: 0 };
  let cursorY = longTip.y;
  for (let i = 0; i < config.slingSegments; i++) {
    const segCenterY = cursorY - segLen / 2;
    const seg = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(longTip.x, segCenterY)
        .setLinearDamping(0.4)
        .setAngularDamping(0.6),
    );
    world.createCollider(RAPIER.ColliderDesc.capsule(segLen / 2 - 0.03, 0.04).setDensity(0.3).setFriction(0.2), seg);
    const jointAnchorOnSeg = { x: 0, y: segLen / 2 };
    const joint = world.createImpulseJoint(
      RAPIER.JointData.revolute(prevLocalAnchor, jointAnchorOnSeg),
      prevBody,
      seg,
      true,
    );
    joint.setContactsEnabled(false);
    segments.push(seg);
    prevBody = seg;
    prevLocalAnchor = { x: 0, y: -segLen / 2 };
    cursorY -= segLen;
  }

  const payload = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(longTip.x, cursorY - config.payloadRadius)
      .setCcdEnabled(true)
      .setLinearDamping(0.02),
  );
  const payloadCollider = world.createCollider(
    RAPIER.ColliderDesc.ball(config.payloadRadius).setDensity(config.payloadMass / (Math.PI * config.payloadRadius ** 2)).setFriction(0.5).setRestitution(0.1),
    payload,
  );
  const releaseJoint = world.createImpulseJoint(
    RAPIER.JointData.revolute(prevLocalAnchor, { x: 0, y: config.payloadRadius }),
    prevBody,
    payload,
    true,
  );
  releaseJoint.setContactsEnabled(false);

  return {
    base,
    arm,
    counterweight,
    slingSegments: segments,
    payload,
    payloadCollider,
    releaseJoint,
    phase: 'cocked',
    shortArm,
    longArm,
    pivot,
  };
}

/** First click: unfreezes the arm and counterweight so gravity takes over. */
export function dropCounterweight(RAPIER: RapierModule, rig: TrebuchetRig): boolean {
  if (rig.phase !== 'cocked') return false;
  rig.arm.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  rig.counterweight.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  rig.phase = 'swinging';
  return true;
}

/** Second click: unhooks the payload from the sling. Release timing is the
 * entire skill ceiling — everything downstream just reads the resulting
 * free-flight trajectory. */
export function releaseSling(world: RAPIER.World, rig: TrebuchetRig): boolean {
  if (rig.phase !== 'swinging' || !rig.releaseJoint) return false;
  world.removeImpulseJoint(rig.releaseJoint, true);
  rig.releaseJoint = null;
  rig.phase = 'released';
  return true;
}

export const trebuchetEntityIds = {
  base: trebuchetId('base'),
  arm: trebuchetId('arm'),
  counterweight: trebuchetId('counterweight'),
  payload: trebuchetId('payload'),
};
