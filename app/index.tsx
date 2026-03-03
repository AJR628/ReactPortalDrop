import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  GestureResponderEvent,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Matter from 'matter-js';
import Colors from '@/constants/colors';
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  BALL_RADIUS,
  BALL_SPEED,
  WALL_THICKNESS,
  PORTAL_LENGTH,
  PORTAL_THICKNESS,
  TELEPORT_COOLDOWN,
  TELEPORT_OFFSET,
  DEFAULT_PORTAL_A,
  DEFAULT_PORTAL_B,
  MIN_PORTAL_DISTANCE,
  MIN_PORTAL_PUCK_DIST,
  SPAWN_X,
  SPAWN_Y,
  Vec2,
  PortalState,
  PortalId,
  GameState,
} from '@/src/constants';
import { signedAngle, rotateVec, magnitude, scale } from '@/src/math';
import { snapToPerimeter } from '@/src/snap';
import {
  createPhysicsWorld,
  startBall,
  resetBall,
  teleportBall,
  setLevelObstacles,
  clearLevelBodies,
} from '@/src/physics';
import { LEVELS, GoalZone, RectObstacle } from '@/src/levels';

const FIXED_DT = 1000 / 60;
const TRANSITION_DURATION = 300;

function ballOverlapsPortal(
  bx: number,
  by: number,
  portal: PortalState
): boolean {
  const isHorizontal = portal.side === 'Top' || portal.side === 'Bottom';
  const hw = isHorizontal ? PORTAL_LENGTH / 2 : PORTAL_THICKNESS / 2;
  const hh = isHorizontal ? PORTAL_THICKNESS / 2 : PORTAL_LENGTH / 2;
  const closestX = Math.max(portal.x - hw, Math.min(bx, portal.x + hw));
  const closestY = Math.max(portal.y - hh, Math.min(by, portal.y + hh));
  const dx = bx - closestX;
  const dy = by - closestY;
  return dx * dx + dy * dy <= BALL_RADIUS * BALL_RADIUS;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function portalDistance(a: PortalState, b: PortalState): number {
  return dist(a.x, a.y, b.x, b.y);
}

function ballCrossesGoal(
  bx: number,
  by: number,
  r: number,
  goal: GoalZone
): boolean {
  if (goal.side === 'Right') {
    return (
      bx + r >= ARENA_WIDTH - goal.thickness &&
      Math.abs(by - goal.center) <= goal.length / 2 + r
    );
  }
  if (goal.side === 'Left') {
    return (
      bx - r <= goal.thickness &&
      Math.abs(by - goal.center) <= goal.length / 2 + r
    );
  }
  if (goal.side === 'Bottom') {
    return (
      by + r >= ARENA_HEIGHT - goal.thickness &&
      Math.abs(bx - goal.center) <= goal.length / 2 + r
    );
  }
  if (goal.side === 'Top') {
    return (
      by - r <= goal.thickness &&
      Math.abs(bx - goal.center) <= goal.length / 2 + r
    );
  }
  return false;
}

export default function PortalDropGame() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;
  const topInset = Platform.OS === 'web' ? webTopInset : insets.top;
  const bottomInset = Platform.OS === 'web' ? webBottomInset : insets.bottom;

  const [gameState, setGameState] = useState<GameState>('PlacingPortal');
  const [portalA, setPortalA] = useState<PortalState>(DEFAULT_PORTAL_A);
  const [portalB, setPortalB] = useState<PortalState>(DEFAULT_PORTAL_B);
  const [ballPos, setBallPos] = useState<Vec2>({ x: SPAWN_X, y: SPAWN_Y });
  const [teleportFlash, setTeleportFlash] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const [nextMovePortalId, setNextMovePortalId] = useState<PortalId>('B');
  const [levelIndex, setLevelIndex] = useState(0);
  const [showWin, setShowWin] = useState(false);

  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const lastTeleportRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const simActiveRef = useRef(false);
  const gameStateRef = useRef<GameState>('PlacingPortal');
  const portalARef = useRef<PortalState>(DEFAULT_PORTAL_A);
  const portalBRef = useRef<PortalState>(DEFAULT_PORTAL_B);
  const nextMovePortalIdRef = useRef<PortalId>('B');
  const ballPosRef = useRef<Vec2>({ x: SPAWN_X, y: SPAWN_Y });
  const arenaLayoutRef = useRef({ x: 0, y: 0 });
  const arenaViewRef = useRef<View>(null);
  const levelBodiesRef = useRef<Matter.Body[]>([]);
  const isTransitioningRef = useRef(false);
  const levelIndexRef = useRef(0);

  const roomTranslateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    portalARef.current = portalA;
  }, [portalA]);

  useEffect(() => {
    portalBRef.current = portalB;
  }, [portalB]);

  const loadLevelObstacles = useCallback((idx: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    clearLevelBodies(engine, levelBodiesRef.current);
    const level = LEVELS[idx];
    const bodies = setLevelObstacles(engine, level.obstacles);
    levelBodiesRef.current = bodies;
  }, []);

  useEffect(() => {
    const { engine, ball } = createPhysicsWorld();
    engineRef.current = engine;
    ballRef.current = ball;

    const bodies = setLevelObstacles(engine, LEVELS[0].obstacles);
    levelBodiesRef.current = bodies;

    let lastTime = performance.now();

    const loop = (now: number) => {
      const elapsed = now - lastTime;
      lastTime = now;

      if (simActiveRef.current) {
        const steps = Math.min(Math.floor(elapsed / FIXED_DT), 4);
        for (let i = 0; i < Math.max(steps, 1); i++) {
          Matter.Engine.update(engine, FIXED_DT);

          const curSpeed = magnitude(ball.velocity);
          if (curSpeed > 0.01) {
            const factor = BALL_SPEED / curSpeed;
            Matter.Body.setVelocity(ball, {
              x: ball.velocity.x * factor,
              y: ball.velocity.y * factor,
            });
          } else {
            Matter.Body.setVelocity(ball, { x: 0, y: BALL_SPEED });
          }
        }

        const bx = ball.position.x;
        const by = ball.position.y;
        setBallPos({ x: bx, y: by });
        ballPosRef.current = { x: bx, y: by };

        if (!isTransitioningRef.current) {
          const currentLevel = LEVELS[levelIndexRef.current];
          if (ballCrossesGoal(bx, by, BALL_RADIUS, currentLevel.goal)) {
            triggerAdvanceRoom();
          }
        }

        const pA = portalARef.current;
        const pB = portalBRef.current;
        const cooldownOk = now - lastTeleportRef.current > TELEPORT_COOLDOWN;

        if (cooldownOk && !isTransitioningRef.current) {
          let entryPortal: PortalState | null = null;
          let exitPortal: PortalState | null = null;
          let exitId: PortalId | null = null;

          if (ballOverlapsPortal(bx, by, pA)) {
            entryPortal = pA;
            exitPortal = pB;
            exitId = 'B';
          } else if (ballOverlapsPortal(bx, by, pB)) {
            entryPortal = pB;
            exitPortal = pA;
            exitId = 'A';
          }

          if (entryPortal && exitPortal && exitId) {
            const angle = signedAngle(entryPortal.normal, exitPortal.normal);
            const vIn = ball.velocity;

            let vOut = rotateVec(vIn, angle);
            const outSpeed = magnitude(vOut);
            if (outSpeed > 0.001) {
              vOut = scale(vOut, BALL_SPEED / outSpeed);
            } else {
              vOut = { x: exitPortal.normal.x * BALL_SPEED, y: exitPortal.normal.y * BALL_SPEED };
            }

            const exitPos = {
              x: exitPortal.x + exitPortal.normal.x * TELEPORT_OFFSET,
              y: exitPortal.y + exitPortal.normal.y * TELEPORT_OFFSET,
            };

            teleportBall(ball, exitPos, vOut);
            lastTeleportRef.current = now;

            Matter.Sleeping.set(ball, false);

            setTeleportFlash(true);
            setTimeout(() => setTeleportFlash(false), 150);

            nextMovePortalIdRef.current = exitId;
            setNextMovePortalId(exitId);
            setTurnCount((c) => c + 1);

            if (Platform.OS !== 'web') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      Matter.Engine.clear(engine);
    };
  }, []);

  const triggerAdvanceRoom = useCallback(() => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    const ball = ballRef.current;
    const engine = engineRef.current;
    if (!ball || !engine) return;

    const savedVelocity = { x: ball.velocity.x, y: ball.velocity.y };
    simActiveRef.current = false;

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    Animated.timing(roomTranslateX, {
      toValue: -ARENA_WIDTH,
      duration: TRANSITION_DURATION,
      useNativeDriver: true,
    }).start(() => {
      const nextIdx = levelIndexRef.current + 1;

      if (nextIdx >= LEVELS.length) {
        isTransitioningRef.current = false;
        setShowWin(true);
        roomTranslateX.setValue(0);
        return;
      }

      levelIndexRef.current = nextIdx;
      setLevelIndex(nextIdx);

      loadLevelObstacles(nextIdx);

      const entryX = BALL_RADIUS + WALL_THICKNESS + 2;
      const entryY = Math.max(
        BALL_RADIUS + WALL_THICKNESS,
        Math.min(ball.position.y, ARENA_HEIGHT - BALL_RADIUS - WALL_THICKNESS)
      );
      Matter.Body.setPosition(ball, { x: entryX, y: entryY });
      setBallPos({ x: entryX, y: entryY });
      ballPosRef.current = { x: entryX, y: entryY };

      const speed = magnitude(savedVelocity);
      if (speed > 0.01) {
        const normalized = scale(savedVelocity, BALL_SPEED / speed);
        Matter.Body.setVelocity(ball, normalized);
      } else {
        Matter.Body.setVelocity(ball, { x: BALL_SPEED, y: 0 });
      }

      roomTranslateX.setValue(ARENA_WIDTH);

      Animated.timing(roomTranslateX, {
        toValue: 0,
        duration: TRANSITION_DURATION,
        useNativeDriver: true,
      }).start(() => {
        simActiveRef.current = true;
        isTransitioningRef.current = false;
      });
    });
  }, [roomTranslateX, loadLevelObstacles]);

  const handleArenaTap = useCallback(
    (e: GestureResponderEvent) => {
      if (isTransitioningRef.current) return;
      const currentState = gameStateRef.current;
      if (currentState !== 'PlacingPortal' && currentState !== 'Ready' && currentState !== 'Running') return;

      let ax: number;
      let ay: number;

      const ne = e.nativeEvent as any;
      if (typeof ne.locationX === 'number' && typeof ne.locationY === 'number') {
        ax = ne.locationX;
        ay = ne.locationY;
      } else if (typeof ne.offsetX === 'number' && typeof ne.offsetY === 'number') {
        ax = ne.offsetX;
        ay = ne.offsetY;
      } else if (typeof ne.pageX === 'number' && typeof ne.pageY === 'number') {
        ax = ne.pageX - arenaLayoutRef.current.x;
        ay = ne.pageY - arenaLayoutRef.current.y;
      } else {
        return;
      }

      ax = Math.max(0, Math.min(ax, ARENA_WIDTH));
      ay = Math.max(0, Math.min(ay, ARENA_HEIGHT));

      const result = snapToPerimeter({ x: ax, y: ay });

      const newPortal: PortalState = {
        x: result.position.x,
        y: result.position.y,
        side: result.side,
        normal: result.normal,
      };

      const target: PortalId = simActiveRef.current
        ? nextMovePortalIdRef.current
        : 'B';

      const otherPortal = target === 'A' ? portalBRef.current : portalARef.current;

      if (portalDistance(newPortal, otherPortal) < MIN_PORTAL_DISTANCE) {
        return;
      }

      if (simActiveRef.current) {
        const bp = ballPosRef.current;
        if (dist(newPortal.x, newPortal.y, bp.x, bp.y) < MIN_PORTAL_PUCK_DIST) {
          return;
        }
      }

      if (target === 'A') {
        setPortalA(newPortal);
        portalARef.current = newPortal;
      } else {
        setPortalB(newPortal);
        portalBRef.current = newPortal;
      }

      if (simActiveRef.current) {
        const next: PortalId = target === 'A' ? 'B' : 'A';
        nextMovePortalIdRef.current = next;
        setNextMovePortalId(next);
      }

      if (currentState === 'PlacingPortal') {
        setGameState('Ready');
        gameStateRef.current = 'Ready';
      }

      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    []
  );

  const handleStart = useCallback(() => {
    const currentState = gameStateRef.current;
    if (currentState !== 'Ready') return;
    const engine = engineRef.current;
    const ball = ballRef.current;
    if (!engine || !ball) return;

    startBall(engine, ball);
    simActiveRef.current = true;
    setGameState('Running');
    gameStateRef.current = 'Running';
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, []);

  const handleReset = useCallback(() => {
    const engine = engineRef.current;
    const ball = ballRef.current;
    if (!engine || !ball) return;

    simActiveRef.current = false;
    isTransitioningRef.current = false;
    resetBall(engine, ball);
    setBallPos({ x: SPAWN_X, y: SPAWN_Y });
    ballPosRef.current = { x: SPAWN_X, y: SPAWN_Y };
    setPortalA(DEFAULT_PORTAL_A);
    portalARef.current = DEFAULT_PORTAL_A;
    setPortalB(DEFAULT_PORTAL_B);
    portalBRef.current = DEFAULT_PORTAL_B;
    setNextMovePortalId('B');
    nextMovePortalIdRef.current = 'B';
    setGameState('PlacingPortal');
    gameStateRef.current = 'PlacingPortal';
    lastTeleportRef.current = 0;
    setTurnCount(0);
    setLevelIndex(0);
    levelIndexRef.current = 0;
    setShowWin(false);
    roomTranslateX.setValue(0);

    loadLevelObstacles(0);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [roomTranslateX, loadLevelObstacles]);

  const currentLevel = LEVELS[levelIndex];

  const renderPortal = (
    portal: PortalState,
    color: string,
    glowColor: string,
    label: string,
    isMovable: boolean
  ) => {
    const isHorizontal = portal.side === 'Top' || portal.side === 'Bottom';
    const w = isHorizontal ? PORTAL_LENGTH : PORTAL_THICKNESS;
    const h = isHorizontal ? PORTAL_THICKNESS : PORTAL_LENGTH;

    let left: number;
    let top: number;

    if (portal.side === 'Top') {
      left = portal.x - PORTAL_LENGTH / 2;
      top = 0;
    } else if (portal.side === 'Bottom') {
      left = portal.x - PORTAL_LENGTH / 2;
      top = ARENA_HEIGHT - PORTAL_THICKNESS;
    } else if (portal.side === 'Left') {
      left = 0;
      top = portal.y - PORTAL_LENGTH / 2;
    } else {
      left = ARENA_WIDTH - PORTAL_THICKNESS;
      top = portal.y - PORTAL_LENGTH / 2;
    }

    return (
      <View
        key={`portal-${label}`}
        style={[
          styles.portal,
          {
            left,
            top,
            width: w,
            height: h,
            backgroundColor: color,
            shadowColor: color,
            shadowOpacity: 0.8,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 0 },
            borderWidth: isMovable ? 1 : 0,
            borderColor: isMovable ? Colors.portalMovableBorder : 'transparent',
          },
        ]}
      >
        <View
          style={[
            styles.portalGlow,
            {
              backgroundColor: glowColor,
              borderRadius: isHorizontal ? h : w,
            },
          ]}
        />
      </View>
    );
  };

  const renderGoal = (goal: GoalZone) => {
    let left: number;
    let top: number;
    let w: number;
    let h: number;

    if (goal.side === 'Right') {
      left = ARENA_WIDTH - goal.thickness;
      top = goal.center - goal.length / 2;
      w = goal.thickness;
      h = goal.length;
    } else if (goal.side === 'Left') {
      left = 0;
      top = goal.center - goal.length / 2;
      w = goal.thickness;
      h = goal.length;
    } else if (goal.side === 'Bottom') {
      left = goal.center - goal.length / 2;
      top = ARENA_HEIGHT - goal.thickness;
      w = goal.length;
      h = goal.thickness;
    } else {
      left = goal.center - goal.length / 2;
      top = 0;
      w = goal.length;
      h = goal.thickness;
    }

    return (
      <View
        key="goal"
        style={[
          styles.goalZone,
          { left, top, width: w, height: h },
        ]}
      />
    );
  };

  const renderObstacles = (obstacles: RectObstacle[]) => {
    return obstacles.map((o, i) => (
      <View
        key={`obs-${i}`}
        style={[
          styles.obstacle,
          {
            left: o.x - o.w / 2,
            top: o.y - o.h / 2,
            width: o.w,
            height: o.h,
          },
        ]}
      />
    ));
  };

  const stateLabel =
    gameState === 'PlacingPortal'
      ? 'PLACE PORTAL'
      : gameState === 'Ready'
        ? 'READY TO LAUNCH'
        : 'IN MOTION';

  const canStart = gameState === 'Ready';

  const movableLabel = `TAP MOVES ${nextMovePortalId}`;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Text style={styles.title}>PORTAL DROP</Text>
        <View style={styles.stateRow}>
          <View
            style={[
              styles.stateDot,
              {
                backgroundColor:
                  gameState === 'Running'
                    ? '#44FF88'
                    : gameState === 'Ready'
                      ? Colors.accent
                      : Colors.textDim,
              },
            ]}
          />
          <Text style={styles.stateText}>{stateLabel}</Text>
          {turnCount > 0 && (
            <Text style={styles.turnText}>
              {' \u00B7 '}TURN {turnCount}
            </Text>
          )}
        </View>
        <View style={styles.subHeaderRow}>
          <Text style={[
            styles.movableLabel,
            { color: nextMovePortalId === 'A' ? Colors.portalA : Colors.portalB },
          ]}>
            {movableLabel}
          </Text>
          <Text style={styles.roomLabel}>ROOM {levelIndex + 1}</Text>
        </View>
      </View>

      <View style={styles.arenaWrapper}>
        <Animated.View style={{ transform: [{ translateX: roomTranslateX }] }}>
          <Pressable
            ref={arenaViewRef}
            onLayout={() => {
              arenaViewRef.current?.measureInWindow((x: number, y: number) => {
                arenaLayoutRef.current = { x, y };
              });
            }}
            onPress={handleArenaTap}
            style={[
              styles.arena,
              teleportFlash && styles.arenaFlash,
            ]}
          >
            {renderGoal(currentLevel.goal)}
            {renderObstacles(currentLevel.obstacles)}

            {renderPortal(
              portalA,
              Colors.portalA,
              Colors.portalAGlow,
              'A',
              nextMovePortalId === 'A'
            )}
            {renderPortal(
              portalB,
              Colors.portalB,
              Colors.portalBGlow,
              'B',
              nextMovePortalId === 'B'
            )}

            <View style={styles.spawnIndicator}>
              <View style={styles.spawnCross} />
              <View style={[styles.spawnCross, styles.spawnCrossH]} />
            </View>

            <View
              style={[
                styles.ball,
                {
                  left: ballPos.x - BALL_RADIUS,
                  top: ballPos.y - BALL_RADIUS,
                },
              ]}
            >
              <View style={styles.ballInner} />
            </View>

            {showWin && (
              <View style={styles.winOverlay}>
                <Text style={styles.winText}>YOU WIN!</Text>
                <Text style={styles.winSubtext}>All 8 rooms cleared</Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      </View>

      <View style={[styles.controls, { paddingBottom: bottomInset + 16 }]}>
        <Pressable
          onPress={handleStart}
          disabled={!canStart}
          style={({ pressed }) => [
            styles.button,
            styles.startButton,
            pressed && canStart && styles.buttonPressed,
            !canStart && styles.buttonDisabled,
          ]}
        >
          <Ionicons
            name="play"
            size={20}
            color={canStart ? '#FFF' : Colors.textDim}
          />
          <Text
            style={[
              styles.buttonText,
              !canStart && styles.buttonTextDisabled,
            ]}
          >
            LAUNCH
          </Text>
        </Pressable>

        <Pressable
          onPress={handleReset}
          style={({ pressed }) => [
            styles.button,
            styles.resetButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Ionicons name="refresh" size={20} color={Colors.text} />
          <Text style={styles.buttonText}>RESET</Text>
        </Pressable>
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: Colors.portalA }]}
          />
          <Text style={styles.legendText}>Portal A</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: Colors.portalB }]}
          />
          <Text style={styles.legendText}>Portal B</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: Colors.goal }]}
          />
          <Text style={styles.legendText}>Doorway</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.text,
    letterSpacing: 4,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  stateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stateText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.textDim,
    letterSpacing: 2,
  },
  turnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.portalB,
    letterSpacing: 1,
  },
  subHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  movableLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 2,
  },
  roomLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 2,
    color: Colors.goal,
  },
  arenaWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  arena: {
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    backgroundColor: Colors.arena,
    borderWidth: 2,
    borderColor: Colors.arenaBorder,
    borderRadius: 4,
    overflow: 'hidden',
  },
  arenaFlash: {
    borderColor: Colors.portalB,
  },
  portal: {
    position: 'absolute',
    zIndex: 2,
  },
  portalGlow: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    opacity: 0.4,
  },
  goalZone: {
    position: 'absolute',
    backgroundColor: Colors.goal,
    zIndex: 1,
    shadowColor: Colors.goal,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  obstacle: {
    position: 'absolute',
    backgroundColor: Colors.obstacle,
    borderWidth: 1,
    borderColor: Colors.obstacleBorder,
    borderRadius: 2,
    zIndex: 1,
  },
  spawnIndicator: {
    position: 'absolute',
    left: SPAWN_X - 8,
    top: SPAWN_Y - 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  spawnCross: {
    position: 'absolute',
    width: 1,
    height: 16,
    backgroundColor: Colors.textDim,
    opacity: 0.3,
  },
  spawnCrossH: {
    width: 16,
    height: 1,
  },
  ball: {
    position: 'absolute',
    width: BALL_RADIUS * 2,
    height: BALL_RADIUS * 2,
    zIndex: 10,
  },
  ballInner: {
    width: BALL_RADIUS * 2,
    height: BALL_RADIUS * 2,
    borderRadius: BALL_RADIUS,
    backgroundColor: Colors.ball,
    shadowColor: Colors.ball,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  winOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8, 8, 14, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  winText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 32,
    color: Colors.goal,
    letterSpacing: 4,
  },
  winSubtext: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.textDim,
    marginTop: 8,
    letterSpacing: 1,
  },
  controls: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    minWidth: 130,
  },
  startButton: {
    backgroundColor: Colors.accent,
  },
  resetButton: {
    backgroundColor: Colors.buttonBg,
    borderWidth: 1,
    borderColor: Colors.arenaBorder,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  buttonDisabled: {
    backgroundColor: Colors.buttonBg,
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
    letterSpacing: 2,
  },
  buttonTextDisabled: {
    color: Colors.textDim,
  },
  legend: {
    flexDirection: 'row',
    gap: 20,
    paddingBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textDim,
    letterSpacing: 1,
  },
});
