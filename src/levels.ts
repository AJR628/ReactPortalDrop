import { ARENA_WIDTH, ARENA_HEIGHT } from './constants';

export type GoalZone = {
  side: 'Left' | 'Right' | 'Top' | 'Bottom';
  center: number;
  length: number;
  thickness: number;
};

export type RectObstacle = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Level = {
  id: string;
  goal: GoalZone;
  obstacles: RectObstacle[];
};

const W = ARENA_WIDTH;
const H = ARENA_HEIGHT;

export const LEVELS: Level[] = [
  {
    id: 'room-1',
    goal: { side: 'Right', center: H * 0.5, length: 60, thickness: 8 },
    obstacles: [],
  },
  {
    id: 'room-2',
    goal: { side: 'Right', center: H * 0.4, length: 60, thickness: 8 },
    obstacles: [
      { x: W * 0.5, y: H * 0.5, w: W * 0.4, h: 10 },
    ],
  },
  {
    id: 'room-3',
    goal: { side: 'Right', center: H * 0.6, length: 60, thickness: 8 },
    obstacles: [
      { x: W * 0.3, y: H * 0.35, w: 10, h: H * 0.3 },
    ],
  },
  {
    id: 'room-4',
    goal: { side: 'Right', center: H * 0.3, length: 60, thickness: 8 },
    obstacles: [
      { x: W * 0.35, y: H * 0.3, w: W * 0.35, h: 10 },
      { x: W * 0.65, y: H * 0.65, w: W * 0.35, h: 10 },
    ],
  },
  {
    id: 'room-5',
    goal: { side: 'Right', center: H * 0.75, length: 60, thickness: 8 },
    obstacles: [
      { x: W * 0.5, y: H * 0.25, w: W * 0.5, h: 10 },
      { x: W * 0.5 + W * 0.25 - 5, y: H * 0.25 + H * 0.15, w: 10, h: H * 0.3 },
    ],
  },
  {
    id: 'room-6',
    goal: { side: 'Right', center: H * 0.5, length: 50, thickness: 8 },
    obstacles: [
      { x: W * 0.25, y: H * 0.25, w: W * 0.35, h: 10 },
      { x: W * 0.6, y: H * 0.5, w: W * 0.3, h: 10 },
      { x: W * 0.35, y: H * 0.72, w: W * 0.4, h: 10 },
    ],
  },
  {
    id: 'room-7',
    goal: { side: 'Right', center: H * 0.2, length: 50, thickness: 8 },
    obstacles: [
      { x: W * 0.3, y: H * 0.2, w: 10, h: H * 0.25 },
      { x: W * 0.6, y: H * 0.15, w: 10, h: H * 0.3 },
      { x: W * 0.45, y: H * 0.55, w: W * 0.4, h: 10 },
      { x: W * 0.3, y: H * 0.75, w: W * 0.35, h: 10 },
    ],
  },
  {
    id: 'room-8',
    goal: { side: 'Right', center: H * 0.85, length: 45, thickness: 8 },
    obstacles: [
      { x: W * 0.5, y: H * 0.18, w: W * 0.55, h: 10 },
      { x: W * 0.25, y: H * 0.38, w: 10, h: H * 0.2 },
      { x: W * 0.7, y: H * 0.45, w: 10, h: H * 0.25 },
      { x: W * 0.45, y: H * 0.65, w: W * 0.4, h: 10 },
      { x: W * 0.2, y: H * 0.8, w: W * 0.3, h: 10 },
    ],
  },
];
