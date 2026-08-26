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
    sling: BodyPose[];
    payload: BodyPose;
    phase: string;
  };
}

export function poseOf(body: { translation(): { x: number; y: number }; rotation(): number }): BodyPose {
  const t = body.translation();
  return { x: t.x, y: t.y, angle: body.rotation() };
}
