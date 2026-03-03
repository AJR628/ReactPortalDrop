import Matter from 'matter-js';
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  WALL_THICKNESS,
  BALL_RADIUS,
  SPAWN_X,
  SPAWN_Y,
} from './constants';

export function createPhysicsWorld() {
  const engine = Matter.Engine.create();
  engine.gravity.x = 0;
  engine.gravity.y = 0;

  const W = ARENA_WIDTH;
  const H = ARENA_HEIGHT;
  const T = WALL_THICKNESS;

  const wallOpts = { isStatic: true, friction: 0.3, restitution: 0.5 };

  const topWall = Matter.Bodies.rectangle(W / 2, -T / 2, W + T * 2, T, wallOpts);
  const bottomWall = Matter.Bodies.rectangle(W / 2, H + T / 2, W + T * 2, T, wallOpts);
  const leftWall = Matter.Bodies.rectangle(-T / 2, H / 2, T, H + T * 2, wallOpts);
  const rightWall = Matter.Bodies.rectangle(W + T / 2, H / 2, T, H + T * 2, wallOpts);

  const ball = Matter.Bodies.circle(SPAWN_X, SPAWN_Y, BALL_RADIUS, {
    restitution: 0.6,
    friction: 0.1,
    density: 0.002,
    frictionAir: 0.001,
  });

  Matter.Body.setVelocity(ball, { x: 0, y: 0 });

  Matter.Composite.add(engine.world, [topWall, bottomWall, leftWall, rightWall, ball]);

  return { engine, ball };
}

export function startBall(engine: Matter.Engine, ball: Matter.Body) {
  Matter.Body.setPosition(ball, { x: SPAWN_X, y: SPAWN_Y });
  Matter.Body.setVelocity(ball, { x: 0, y: 0 });
  Matter.Body.setAngularVelocity(ball, 0);
  engine.gravity.y = 1;
}

export function resetBall(engine: Matter.Engine, ball: Matter.Body) {
  engine.gravity.y = 0;
  Matter.Body.setPosition(ball, { x: SPAWN_X, y: SPAWN_Y });
  Matter.Body.setVelocity(ball, { x: 0, y: 0 });
  Matter.Body.setAngularVelocity(ball, 0);
}

export function teleportBall(
  ball: Matter.Body,
  exitPos: { x: number; y: number },
  newVelocity: { x: number; y: number }
) {
  Matter.Body.setPosition(ball, exitPos);
  Matter.Body.setVelocity(ball, newVelocity);
}
