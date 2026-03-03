import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const ARENA_WIDTH = Math.min(SCREEN_WIDTH - 32, 360);
export const ARENA_HEIGHT = Math.round(ARENA_WIDTH * 1.6);

export const WALL_THICKNESS = 16;
export const BALL_RADIUS = 12;
export const PORTAL_LENGTH = 60;
export const PORTAL_THICKNESS = 10;
export const CORNER_MARGIN = 16;

export const SPAWN_X = ARENA_WIDTH / 2;
export const SPAWN_Y = BALL_RADIUS + 40;

export const BALL_SPEED = 4;
export const TELEPORT_COOLDOWN = 150;
export const TELEPORT_OFFSET = BALL_RADIUS + (PORTAL_THICKNESS / 2) + 2;
export const MIN_PORTAL_DISTANCE = 40;

export type PortalSide = 'Top' | 'Bottom' | 'Left' | 'Right';
export type Vec2 = { x: number; y: number };

export const ARENA_RECT = {
  left: 0,
  top: 0,
  right: ARENA_WIDTH,
  bottom: ARENA_HEIGHT,
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
};

export const INWARD_NORMALS: Record<PortalSide, Vec2> = {
  Top: { x: 0, y: 1 },
  Bottom: { x: 0, y: -1 },
  Left: { x: 1, y: 0 },
  Right: { x: -1, y: 0 },
};

export interface PortalState {
  x: number;
  y: number;
  side: PortalSide;
  normal: Vec2;
}

export const INITIAL_ENTRY_PORTAL: PortalState = {
  x: ARENA_WIDTH / 2,
  y: ARENA_HEIGHT - 10,
  side: 'Bottom',
  normal: { x: 0, y: -1 },
};

export const DEFAULT_EXIT_PORTAL: PortalState = {
  x: ARENA_WIDTH,
  y: ARENA_HEIGHT / 2,
  side: 'Right',
  normal: { x: -1, y: 0 },
};

export type GameState = 'PlacingPortal' | 'Ready' | 'Running' | 'PlacingNextExit';
