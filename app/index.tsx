import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  GestureResponderEvent,
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
  PORTAL_LENGTH,
  PORTAL_THICKNESS,
  TELEPORT_COOLDOWN,
  TELEPORT_OFFSET,
  INITIAL_ENTRY_PORTAL,
  DEFAULT_EXIT_PORTAL,
  MIN_PORTAL_DISTANCE,
  SPAWN_X,
  SPAWN_Y,
  Vec2,
  PortalState,
  GameState,
} from '@/src/constants';
import { signedAngle, rotateVec, magnitude, scale } from '@/src/math';
import { snapToPerimeter } from '@/src/snap';
import { createPhysicsWorld, startBall, resetBall, teleportBall } from '@/src/physics';

const FIXED_DT = 1000 / 60;

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

function portalDistance(a: PortalState, b: PortalState): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function PortalDropGame() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;
  const topInset = Platform.OS === 'web' ? webTopInset : insets.top;
  const bottomInset = Platform.OS === 'web' ? webBottomInset : insets.bottom;

  const [gameState, setGameState] = useState<GameState>('PlacingPortal');
  const [entryPortal, setEntryPortal] = useState<PortalState>(INITIAL_ENTRY_PORTAL);
  const [exitPortal, setExitPortal] = useState<PortalState>(DEFAULT_EXIT_PORTAL);
  const [ballPos, setBallPos] = useState<Vec2>({ x: SPAWN_X, y: SPAWN_Y });
  const [teleportFlash, setTeleportFlash] = useState(false);
  const [turnCount, setTurnCount] = useState(0);

  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const lastTeleportRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const simActiveRef = useRef(false);
  const gameStateRef = useRef<GameState>('PlacingPortal');
  const entryPortalRef = useRef<PortalState>(INITIAL_ENTRY_PORTAL);
  const exitPortalRef = useRef<PortalState>(DEFAULT_EXIT_PORTAL);
  const arenaLayoutRef = useRef({ x: 0, y: 0 });
  const arenaViewRef = useRef<View>(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    entryPortalRef.current = entryPortal;
  }, [entryPortal]);

  useEffect(() => {
    exitPortalRef.current = exitPortal;
  }, [exitPortal]);

  useEffect(() => {
    const { engine, ball } = createPhysicsWorld();
    engineRef.current = engine;
    ballRef.current = ball;

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

        const currentEntry = entryPortalRef.current;
        if (
          ballOverlapsPortal(bx, by, currentEntry) &&
          now - lastTeleportRef.current > TELEPORT_COOLDOWN
        ) {
          const ep = exitPortalRef.current;
          const angle = signedAngle(currentEntry.normal, ep.normal);
          const vIn = ball.velocity;

          let vOut = rotateVec(vIn, angle);
          const outSpeed = magnitude(vOut);
          if (outSpeed > 0.001) {
            vOut = scale(vOut, BALL_SPEED / outSpeed);
          } else {
            vOut = { x: ep.normal.x * BALL_SPEED, y: ep.normal.y * BALL_SPEED };
          }

          const exitPos = {
            x: ep.x + ep.normal.x * TELEPORT_OFFSET,
            y: ep.y + ep.normal.y * TELEPORT_OFFSET,
          };

          teleportBall(ball, exitPos, vOut);
          lastTeleportRef.current = now;

          Matter.Sleeping.set(ball, false);

          setTeleportFlash(true);
          setTimeout(() => setTeleportFlash(false), 150);

          const newEntry: PortalState = { ...ep };
          setEntryPortal(newEntry);
          entryPortalRef.current = newEntry;

          setTurnCount((c) => c + 1);
          setGameState('PlacingNextExit');
          gameStateRef.current = 'PlacingNextExit';

          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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

  const handleArenaTap = useCallback(
    (e: GestureResponderEvent) => {
      const currentState = gameStateRef.current;
      if (currentState !== 'PlacingPortal' && currentState !== 'Ready' && currentState !== 'PlacingNextExit' && currentState !== 'Running') return;

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

      if (portalDistance(newPortal, entryPortalRef.current) < MIN_PORTAL_DISTANCE) {
        return;
      }

      setExitPortal(newPortal);
      exitPortalRef.current = newPortal;

      if (currentState === 'PlacingPortal') {
        setGameState('Ready');
        gameStateRef.current = 'Ready';
      } else if (currentState === 'PlacingNextExit') {
        setGameState('Running');
        gameStateRef.current = 'Running';
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
    resetBall(engine, ball);
    setBallPos({ x: SPAWN_X, y: SPAWN_Y });
    setEntryPortal(INITIAL_ENTRY_PORTAL);
    entryPortalRef.current = INITIAL_ENTRY_PORTAL;
    setExitPortal(DEFAULT_EXIT_PORTAL);
    exitPortalRef.current = DEFAULT_EXIT_PORTAL;
    setGameState('PlacingPortal');
    gameStateRef.current = 'PlacingPortal';
    lastTeleportRef.current = 0;
    setTurnCount(0);

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const renderPortal = (
    portal: PortalState,
    color: string,
    glowColor: string,
    label: string
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

  const stateLabel =
    gameState === 'PlacingPortal'
      ? 'PLACE EXIT PORTAL'
      : gameState === 'PlacingNextExit'
        ? 'PLACE NEXT EXIT'
        : gameState === 'Ready'
          ? 'READY TO LAUNCH'
          : 'IN MOTION';

  const canStart = gameState === 'Ready';

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
                      : gameState === 'PlacingNextExit'
                        ? Colors.exitPortal
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
      </View>

      <View style={styles.arenaWrapper}>
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
          {renderPortal(
            entryPortal,
            Colors.entryPortal,
            Colors.entryPortalGlow,
            'entry'
          )}
          {renderPortal(
            exitPortal,
            Colors.exitPortal,
            Colors.exitPortalGlow,
            'exit'
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
        </Pressable>
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
            style={[styles.legendDot, { backgroundColor: Colors.entryPortal }]}
          />
          <Text style={styles.legendText}>Entry</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[styles.legendDot, { backgroundColor: Colors.exitPortal }]}
          />
          <Text style={styles.legendText}>Exit</Text>
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
    paddingBottom: 12,
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
    color: Colors.exitPortal,
    letterSpacing: 1,
  },
  arenaWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    borderColor: Colors.exitPortal,
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
