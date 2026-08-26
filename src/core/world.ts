import type RAPIER from '@dimforge/rapier2d-compat';
import type { RapierModule } from './rapier-init';
import type { BlockSpec, Level, MaterialId, PersonSpec } from './types';
import { MATERIALS, jointBreakImpulse } from './materials';
import { blockId, personId, type EntityId } from './entities';
import { rectsNearOrOverlap } from './geometry';

export const GROUND_Y = 0;
const GROUND_HALF_THICKNESS = 5;
const GROUND_HALF_WIDTH = 2000;
const ADJACENCY_EPSILON = 0.03;
export const PERSON_RADIUS = 0.22;
export const PERSON_CAPSULE_HALF_HEIGHT = 0.32;

export interface BlockBody {
  id: EntityId;
  index: number;
  material: MaterialId;
  w: number;
  h: number;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  /** True once every joint attaching this block to the rest of the structure has broken. */
  detached: boolean;
}

export interface PersonBody {
  id: EntityId;
  index: number;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  alive: boolean;
  /** Impulse magnitude (N*s) accumulated on this body during the current tick. */
  tickImpulse: number;
}

export interface BreakableJoint {
  handle: number;
  joint: RAPIER.ImpulseJoint;
  blockA: number;
  blockB: number;
  breakImpulse: number;
  broken: boolean;
}

export interface SimWorld {
  world: RAPIER.World;
  ground: RAPIER.RigidBody;
  blocks: BlockBody[];
  people: PersonBody[];
  joints: BreakableJoint[];
  /** RAPIER rigid-body handle -> our block index, for fast lookup from contact/joint events. */
  blockByHandle: Map<number, number>;
  personByHandle: Map<number, number>;
}

function buildGround(RAPIER: RapierModule, world: RAPIER.World): RAPIER.RigidBody {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_Y - GROUND_HALF_THICKNESS));
  const collider = RAPIER.ColliderDesc.cuboid(GROUND_HALF_WIDTH, GROUND_HALF_THICKNESS)
    .setFriction(0.9)
    .setRestitution(0.0);
  world.createCollider(collider, body);
  return body;
}

function buildBlock(
  RAPIER: RapierModule,
  world: RAPIER.World,
  spec: BlockSpec,
  index: number,
): BlockBody {
  const mat = MATERIALS[spec.material];
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(spec.x, spec.y).setRotation(spec.angle),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(spec.w / 2, spec.h / 2)
      .setDensity(mat.density)
      .setFriction(mat.friction)
      .setRestitution(mat.restitution),
    body,
  );
  return { id: blockId(index), index, material: spec.material, w: spec.w, h: spec.h, body, collider, detached: false };
}

function buildPerson(
  RAPIER: RapierModule,
  world: RAPIER.World,
  spec: PersonSpec,
  index: number,
): PersonBody {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(spec.x, spec.y).setLinearDamping(0.05),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(PERSON_CAPSULE_HALF_HEIGHT, PERSON_RADIUS)
      .setDensity(1.0)
      .setFriction(0.8)
      .setRestitution(0.0),
    body,
  );
  return { id: personId(index), index, body, collider, alive: true, tickImpulse: 0 };
}

/** Joins every pair of blocks whose rectangles touch (within a small epsilon)
 * with a fixed joint, and records the impulse threshold at which it snaps.
 * See `breakable.ts` for why breakage is detected via per-body momentum
 * delta rather than a direct joint-impulse readback. */
function joinAdjacentBlocks(RAPIER: RapierModule, world: RAPIER.World, blocks: BlockBody[], specs: BlockSpec[]): BreakableJoint[] {
  const joints: BreakableJoint[] = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (!rectsNearOrOverlap(specs[i]!, specs[j]!, ADJACENCY_EPSILON)) continue;
      const a = blocks[i]!;
      const b = blocks[j]!;
      const midX = (specs[i]!.x + specs[j]!.x) / 2;
      const midY = (specs[i]!.y + specs[j]!.y) / 2;
      const anchorA = worldToLocal(a.body, midX, midY);
      const anchorB = worldToLocal(b.body, midX, midY);
      // frame1/frame2 lock the *current* relative rotation between the two
      // blocks (which may differ, e.g. an angled roof block against a
      // vertical wall block) rather than forcing them into the same
      // world-space orientation.
      const frameA = 0;
      const frameB = specs[i]!.angle - specs[j]!.angle;
      const jointData = RAPIER.JointData.fixed(anchorA, frameA, anchorB, frameB);
      const joint = world.createImpulseJoint(jointData, a.body, b.body, true);
      joint.setContactsEnabled(false);
      joints.push({
        handle: joint.handle,
        joint,
        blockA: i,
        blockB: j,
        breakImpulse: jointBreakImpulse(a.material, b.material),
        broken: false,
      });
    }
  }
  return joints;
}

function worldToLocal(body: RAPIER.RigidBody, x: number, y: number): { x: number; y: number } {
  const t = body.translation();
  const rot = body.rotation();
  const c = Math.cos(-rot);
  const s = Math.sin(-rot);
  const dx = x - t.x;
  const dy = y - t.y;
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

export function buildWorld(RAPIER: RapierModule, level: Level, gravity = { x: 0, y: -20 }): SimWorld {
  const world = new RAPIER.World(gravity);
  const ground = buildGround(RAPIER, world);
  const blocks = level.blocks.map((spec, i) => buildBlock(RAPIER, world, spec, i));
  const people = level.people.map((spec, i) => buildPerson(RAPIER, world, spec, i));
  const joints = joinAdjacentBlocks(RAPIER, world, blocks, level.blocks);

  const blockByHandle = new Map<number, number>();
  blocks.forEach((b, i) => blockByHandle.set(b.body.handle, i));
  const personByHandle = new Map<number, number>();
  people.forEach((p, i) => personByHandle.set(p.body.handle, i));

  return { world, ground, blocks, people, joints, blockByHandle, personByHandle };
}
