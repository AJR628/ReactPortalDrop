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
  PORTAL_LENGTH,
  PORTAL_THICKNESS,
  TELEPORT_COOLDOWN,
  TELEPORT_OFFSET,
  ENTRY_PORTAL,
  DEFAULT_EXIT_PORTAL,
  SPAWN_X,
  SPAWN_Y,
  Vec2,
  PortalSide,
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
  portal: PortalState,
  isHorizontal: boolean
): boolean {
  const hw = isHorizontal ? PORTAL_LENGTH / 2 : PORTAL_THICKNESS / 2;
  const hh = isHorizontal ? PORTAL_THICKNESS / 2 : PORTAL_LENGTH / 2;
  const closestX = Math.max(portal.x - hw, Math.min(bx, portal.x + hw));
  const closestY = Math.max(portal.y - hh, Math.min(by, portal.y + hh));
  const dx = bx - closestX;
  const dy = by - closestY;
  return dx * dx + dy * dy <= BALL_RADIUS * BALL_RADIUS;
}

export default function PortalDropGame() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;
  const topInset = Platform.OS === 'web' ? webTopInset : insets.top;
  const bottomInset = Platform.OS === 'web' ? webBottomInset : insets.bottom;

  const [gameState, setGameState] = useState<GameState>('PlacingPortal');
  const [exitPortal, setExitPortal] = useState<PortalState>(DEFAULT_EXIT_PORTAL);
  const [ballPos, setBallPos] = useState<Vec2>({ x: SPAWN_X, y: SPAWN_Y });
  const [teleportFlash, setTeleportFlash] = useState(false);

  const engineRef = useRef<Matter.Engine | null>(null);
  const ballRef = useRef<Matter.Body | null>(null);
  const lastTeleportRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const gameStateRef = useRef<GameState>('PlacingPortal');
  const exitPortalRef = useRef<PortalState>(DEFAULT_EXIT_PORTAL);
  const arenaLayoutRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    exitPortalRef.current = exitPortal;
  }, [exitPortal]);

  useEffect(() => {
    const { engine, ball } = createPhysicsWorld();
    engineRef.current = engine;
    ballRef.current = ball;
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      Matter.Engine.clear(engine);
    };
  }, []);

  useEffect(() => {
    if (gameState !== 'Running') {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      return;
    }

    const engine = engineRef.current;
    const ball = ballRef.current;
    if (!engine || !ball) return;

    startBall(engine, ball);

    let lastTime = performance.now();

    const loop = (now: number) => {
      if (gameStateRef.current !== 'Running') return;

      const elapsed = now - lastTime;
      lastTime = now;
      const steps = Math.min(Math.floor(elapsed / FIXED_DT), 4);

      for (let i = 0; i < Math.max(steps, 1); i++) {
        Matter.Engine.update(engine, FIXED_DT);
      }

      const bx = ball.position.x;
      const by = ball.position.y;
      setBallPos({ x: bx, y: by });

      const entryIsHorizontal =
        ENTRY_PORTAL.side === 'Top' || ENTRY_PORTAL.side === 'Bottom';
      if (
        ballOverlapsPortal(bx, by, ENTRY_PORTAL, entryIsHorizontal) &&
        now - lastTeleportRef.current > TELEPORT_COOLDOWN
      ) {
        const ep = exitPortalRef.current;
        const angle = signedAngle(ENTRY_PORTAL.normal, ep.normal);
        const vIn = ball.velocity;
        const speed = magnitude(vIn);
        let vOut = rotateVec(vIn, angle);
        const outSpeed = magnitude(vOut);
        if (outSpeed > 0.001 && Math.abs(outSpeed - speed) > 0.001) {
          vOut = scale(vOut, speed / outSpeed);
        }

        const exitPos = {
          x: ep.x + ep.normal.x * TELEPORT_OFFSET,
          y: ep.y + ep.normal.y * TELEPORT_OFFSET,
        };

        teleportBall(ball, exitPos, vOut);
        lastTeleportRef.current = now;

        setTeleportFlash(true);
        setTimeout(() => setTeleportFlash(false), 120);

        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [gameState]);

  const handleArenaTap = useCallback(
    (e: GestureResponderEvent) => {
      if (gameStateRef.current === 'Running') return;

      const pageX = e.nativeEvent.pageX;
      const pageY = e.nativeEvent.pageY;
      const ax = pageX - arenaLayoutRef.current.x;
      const ay = pageY - arenaLayoutRef.current.y;

      const result = snapToPerimeter({ x: ax, y: ay });

      setExitPortal({
        x: result.position.x,
        y: result.position.y,
        side: result.side,
        normal: result.normal,
      });

      if (gameStateRef.current === 'PlacingPortal') {
        setGameState('Ready');
      }

      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    []
  );

  const handleStart = useCallback(() => {
    if (gameStateRef.current === 'Running') return;
    setGameState('Running');
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }, []);

  const handleReset = useCallback(() => {
    const engine = engineRef.current;
    const ball = ballRef.current;
    if (!engine || !ball) return;

    resetBall(engine, ball);
    setBallPos({ x: SPAWN_X, y: SPAWN_Y });
    setGameState('Ready');
    lastTeleportRef.current = 0;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const handleArenaLayout = useCallback(() => {
    arenaViewRef.current?.measureInWindow((x: number, y: number) => {
      arenaLayoutRef.current = { x, y };
    });
  }, []);

  const arenaViewRef = useRef<View>(null);

  const renderPortal = (portal: PortalState, color: string, glowColor: string) => {
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
        key={`portal-${color}`}
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
      ? 'TAP EDGE TO PLACE PORTAL'
      : gameState === 'Ready'
        ? 'READY'
        : 'RUNNING';

  const canStart = gameState === 'Ready' || gameState === 'PlacingPortal';

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
        </View>
      </View>

      <View style={styles.arenaWrapper}>
        <Pressable
          ref={arenaViewRef}
          onLayout={handleArenaLayout}
          onPress={handleArenaTap}
          style={[
            styles.arena,
            teleportFlash && styles.arenaFlash,
          ]}
        >
          {renderPortal(
            ENTRY_PORTAL,
            Colors.entryPortal,
            Colors.entryPortalGlow
          )}
          {renderPortal(exitPortal, Colors.exitPortal, Colors.exitPortalGlow)}

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
            pressed && styles.buttonPressed,
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
            DROP
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
