import { Vec2, PortalSide, ARENA_RECT, PORTAL_LENGTH, CORNER_MARGIN, INWARD_NORMALS } from './constants';

export interface SnapResult {
  position: Vec2;
  side: PortalSide;
  normal: Vec2;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function snapToPerimeter(point: Vec2): SnapResult {
  const { left, top, right, bottom } = ARENA_RECT;
  const margin = PORTAL_LENGTH / 2 + CORNER_MARGIN;

  const dTop = Math.abs(point.y - top);
  const dBottom = Math.abs(point.y - bottom);
  const dLeft = Math.abs(point.x - left);
  const dRight = Math.abs(point.x - right);

  const minDist = Math.min(dTop, dBottom, dLeft, dRight);

  let side: PortalSide;
  let position: Vec2;

  if (minDist === dTop) {
    side = 'Top';
    position = { x: clamp(point.x, left + margin, right - margin), y: top };
  } else if (minDist === dBottom) {
    side = 'Bottom';
    position = { x: clamp(point.x, left + margin, right - margin), y: bottom };
  } else if (minDist === dLeft) {
    side = 'Left';
    position = { x: left, y: clamp(point.y, top + margin, bottom - margin) };
  } else {
    side = 'Right';
    position = { x: right, y: clamp(point.y, top + margin, bottom - margin) };
  }

  return {
    position,
    side,
    normal: INWARD_NORMALS[side],
  };
}
