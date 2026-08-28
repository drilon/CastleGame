export interface BodyPose {
  x: number;
  y: number;
  angle: number;
}

export interface RenderSnapshot {
  tick: number;
  blocks: (BodyPose & { id: string; material: string; detached: boolean; w: number; h: number })[];
  people: (BodyPose & { id: string; alive: boolean })[];
  trebuchet: {
    arm: BodyPose;
    counterweight: BodyPose;
    /** Zero or one segment: the sling line from arm tip to payload, with
     * its current length (it is a rope, so this varies with slack). */
    sling: (BodyPose & { length: number })[];
    payload: BodyPose;
    phase: string;
    /** Static geometry of the machine, so the renderer can draw a real
     * frame (A-frame legs, beam, counterweight box) at the right scale
     * instead of guessing. */
    pivot: { x: number; y: number };
    armLength: number;
    armThickness: number;
    longArm: number;
    shortArm: number;
    counterweightSize: number;
  };
}

export function poseOf(body: { translation(): { x: number; y: number }; rotation(): number }): BodyPose {
  const t = body.translation();
  return { x: t.x, y: t.y, angle: body.rotation() };
}
