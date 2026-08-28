import type RAPIER from '@dimforge/rapier2d-compat';
import type { RapierModule } from './rapier-init';
import type { TrebuchetConfig } from './types';
import { trebuchetId } from './entities';

export type TrebuchetPhase = 'cocked' | 'swinging' | 'released';

const ARM_THICKNESS = 0.22;
const COUNTERWEIGHT_SIZE = 0.9;
/**
 * Angle of the long arm at rest, measured from +x (downrange).
 *
 * The arm is a straight lever, so the tip and the counterweight are always
 * on opposite sides of the pivot — which fixes the rotation sense. Gravity
 * on a counterweight at offset r applies torque -r_x*m*g, so the weight
 * must start BEHIND the pivot (-x) to drive the arm counter-clockwise and
 * sweep the tip up and downrange. That means the tip itself starts down
 * and slightly FORWARD. Cocking it down-and-back instead puts the weight
 * in front, spins the arm the other way, and throws over the back of the
 * machine.
 */
const COCK_ANGLE = -1.396; // -80deg

export interface TrebuchetRig {
  base: RAPIER.RigidBody;
  arm: RAPIER.RigidBody;
  counterweight: RAPIER.RigidBody;
  payload: RAPIER.RigidBody;
  payloadCollider: RAPIER.Collider;
  releaseJoint: RAPIER.ImpulseJoint | null;
  phase: TrebuchetPhase;
  shortArm: number;
  longArm: number;
  slingLength: number;
  pivot: { x: number; y: number };
}

/** World-space position of the long-arm tip, where the sling is attached.
 * The renderer draws the sling as a line from here to the payload. */
export function slingAnchorWorld(rig: TrebuchetRig): { x: number; y: number } {
  const t = rig.arm.translation();
  const r = rig.arm.rotation();
  return { x: t.x + rig.longArm * Math.cos(r), y: t.y + rig.longArm * Math.sin(r) };
}

export function buildTrebuchet(RAPIER: RapierModule, world: RAPIER.World, config: TrebuchetConfig): TrebuchetRig {
  const shortArm = config.armLength / (1 + config.armRatio);
  const longArm = shortArm * config.armRatio;
  const pivot = { x: config.x, y: config.y };
  const dir = { x: Math.cos(COCK_ANGLE), y: Math.sin(COCK_ANGLE) };

  // The base is the fixed anchor for the arm's revolute joint. It carries NO
  // collider on purpose: in 2D a support column would sit squarely in the
  // payload's swing path and the machine would shoot itself. Real frames
  // straddle the sling in the third dimension, which we don't have.
  const base = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pivot.x, pivot.y));

  // Arm spans [-shortArm, +longArm] along its local x axis; local origin is the pivot.
  const arm = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(pivot.x, pivot.y)
      .setRotation(COCK_ANGLE)
      .setAngularDamping(0.08)
      .setLinearDamping(0.05),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid((longArm + shortArm) / 2, ARM_THICKNESS / 2)
      .setTranslation((longArm - shortArm) / 2, 0)
      .setDensity(7.8)
      .setFriction(0.3)
      // The arm must not collide with the castle or the payload; it is a
      // mechanism, not a weapon.
      .setSensor(true),
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
      .setFriction(0.5)
      .setSensor(true),
    counterweight,
  );
  world.createImpulseJoint(
    RAPIER.JointData.revolute({ x: -shortArm, y: 0 }, { x: 0, y: 0 }),
    arm,
    counterweight,
    true,
  );

  // Sling: a ROPE, not a rigid link. A rope only ever pulls, which is what
  // makes the throw predictable; a jointed rigid link can also push, turning
  // arm+sling into a double pendulum — the classic chaotic system, and the
  // reason the old rig's landing point jumped tens of metres between
  // adjacent release ticks.
  const longTip = { x: pivot.x + longArm * dir.x, y: pivot.y + longArm * dir.y };
  const slingLength = Math.max(0.4, config.slingLength);

  // Rest the payload on the ground, sling-length from the tip, trailing
  // behind the machine — the pouch lying in the trough before the shot.
  const groundY = config.payloadRadius;
  const drop = longTip.y - groundY;
  const back = slingLength > Math.abs(drop) ? Math.sqrt(slingLength * slingLength - drop * drop) : 0;
  const payloadStart = {
    x: longTip.x - back,
    y: slingLength > Math.abs(drop) ? groundY : longTip.y - slingLength,
  };

  const payload = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(payloadStart.x, payloadStart.y)
      .setCcdEnabled(true)
      .setLinearDamping(0.01),
  );
  const payloadCollider = world.createCollider(
    RAPIER.ColliderDesc.ball(config.payloadRadius)
      .setDensity(config.payloadMass / (Math.PI * config.payloadRadius ** 2))
      .setFriction(0.4)
      .setRestitution(0.1),
    payload,
  );
  const releaseJoint = world.createImpulseJoint(
    RAPIER.JointData.rope(slingLength, { x: longArm, y: 0 }, { x: 0, y: 0 }),
    arm,
    payload,
    true,
  );
  releaseJoint.setContactsEnabled(false);

  return {
    base,
    arm,
    counterweight,
    payload,
    payloadCollider,
    releaseJoint,
    phase: 'cocked',
    shortArm,
    longArm,
    slingLength,
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
