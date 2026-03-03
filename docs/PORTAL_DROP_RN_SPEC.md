# Portal Drop — React Native Spec (SSOT)

## Overview
Portal Drop is a 2D physics puzzle prototype with a perpetual loop mechanic. The player places an exit portal on the arena boundary, launches a constant-velocity puck, and the puck teleports from the entry portal to the exit portal with velocity rotated according to portal normals. After each teleport, the exit portal becomes the new entry portal. The puck bounces off walls elastically and moves in straight lines — no gravity, no arcing.

## Game States
- **PlacingPortal**: Initial state. User taps arena boundary to place exit portal. Puck is frozen at spawn.
- **Ready**: Exit portal has been placed. User can reposition it or press Launch.
- **Running**: Puck is moving at constant velocity. Physics active. Teleportation enabled. User can reposition exit portal.
- **PlacingNextExit**: After a successful teleport. The previous exit is now the entry. User places the next exit portal. Puck keeps moving.
- Reset returns to **PlacingPortal** (full reset to initial state).

## Coordinate System
React Native and Matter.js both use **y-down** coordinates.
- Origin (0,0) is top-left of the arena.
- Positive Y is downward.

### Inward Normals (pointing INTO the arena)
| Wall   | Normal    |
|--------|-----------|
| Top    | (0, +1)   |
| Bottom | (0, -1)   |
| Left   | (+1, 0)   |
| Right  | (-1, 0)   |

## ArenaRect (Authoritative)
Computed at runtime:
- `arenaWidth = min(screenWidth - 32, 360)`
- `arenaHeight = round(arenaWidth * 1.6)` (10:16 ratio)
- Stored as `{ left: 0, top: 0, right: arenaWidth, bottom: arenaHeight, width, height }`

## Puck Physics (Authoritative)
- Motion model: constant-velocity straight trajectory (no gravity).
- `engine.gravity.y = 0` always. Gravity is never enabled.
- `BALL_SPEED = 4` px per physics tick. Every tick, velocity is normalized: `v = normalize(v) * BALL_SPEED`.
- If speed drops near zero (e.g. degenerate collision), re-seed direction to `(0, BALL_SPEED)` (straight down).
- Ball body: `restitution: 1.0`, `friction: 0`, `frictionAir: 0`, `frictionStatic: 0`.
- Wall bodies: `restitution: 1.0`, `friction: 0`.
- On LAUNCH: position to spawn, set velocity `(0, BALL_SPEED)` (straight down).
- On RESET: zero velocity, move to spawn.

## Wall Bounce
- Walls bounce the puck elastically (restitution 1.0, zero friction).
- After bounce, velocity is normalized back to BALL_SPEED on the next tick.
- Puck can bounce back through portals naturally.

## Teleport Rule (Authoritative)
```
angle = signedAngle(entryNormal, exitNormal)
vOut = rotate(vIn, angle)
vOut = normalize(vOut) * BALL_SPEED
teleportPosition = exitPortalCenter + exitNormal * TELEPORT_OFFSET
TELEPORT_OFFSET = BALL_RADIUS + PORTAL_THICKNESS/2 + 2
cooldown = 150ms
```

If vOut speed is near zero after rotation, fall back to `exitNormal * BALL_SPEED`.

### signedAngle
`atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)`

### rotateVec
```
x' = x * cos(angle) - y * sin(angle)
y' = x * sin(angle) + y * cos(angle)
```

## Perpetual Loop Rule
After a successful teleport:
1. The exit portal becomes the new entry portal.
2. Puck keeps moving at constant velocity (sim stays active via simActiveRef).
3. Game state transitions to `PlacingNextExit`.
4. User places a new exit portal (tapping transitions directly back to Running — no second LAUNCH needed).
5. Puck continues bouncing until it hits the new entry portal.

### Placement constraint
Exit portal must be at least `MIN_PORTAL_DISTANCE` (40px) from the current entry portal. Placements too close are ignored.
Placement is allowed in all states (PlacingPortal, Ready, PlacingNextExit, Running).

## Snap-to-Boundary Algorithm
Given a tap point in arena coordinates (using `locationX`/`locationY`):
1. Compute distance to each edge (top, bottom, left, right).
2. Choose nearest edge → determines `PortalSide`.
3. Snap coordinate to that edge.
4. Clamp along-edge coordinate by `margin = portalLength/2 + cornerMargin`.
   - `cornerMargin = 16px`
5. Quantization: OFF by default.

## Critical Rules
- Teleport triggers ONLY on entry portal overlap. Exit portal does NOT teleport.
- Gravity is ALWAYS off. Motion is constant-velocity only.
- Arena tap handler uses `locationX`/`locationY` for coordinates relative to the arena.
- Cooldown prevents re-teleport for 150ms after each teleport.
- After teleport, puck keeps moving. No freeze, no re-drop from spawn.
- Speed is forced constant every physics tick via normalization.

## Script Responsibilities
| File | Purpose |
|------|---------|
| `src/constants.ts` | Arena dimensions, physics constants (incl. BALL_SPEED), portal defaults, game states |
| `src/math.ts` | Vector rotation, signed angle, magnitude |
| `src/snap.ts` | Snap-to-perimeter algorithm |
| `src/physics.ts` | Matter.js engine creation (zero-gravity, elastic walls), ball start/reset/teleport |
| `app/index.tsx` | Main game screen, rendering, game loop with speed normalization, input, perpetual loop |

## Acceptance Checks
1. Press LAUNCH: puck moves straight down at constant speed (no curve, no arc).
2. Puck hits a wall: bounces elastically, continues at same constant speed.
3. Place EXIT on left wall: puck enters ENTRY then exits left portal moving rightward (straight).
4. While puck moves, place a new EXIT on top wall. Next time puck hits ENTRY, it teleports correctly.
5. If puck misses ENTRY and hits a wall, it bounces. If it bounces back through the portal it came out of, it teleports again per the current entry/exit chain.
6. RESET restores initial spawn + ENTRY/EXIT defaults and puck is stopped until LAUNCH.

## Non-Goals (MVP)
- No level system
- No scoring beyond turn counter
- No particles or sound
- No backend, auth, ads, purchases
- No navigation or multiple screens

## Decision Log
| Decision | Rationale |
|----------|-----------|
| Constant-velocity puck instead of gravity drop | Straight-line motion makes portal chaining predictable and strategic |
| Speed normalized every tick | Prevents energy loss/gain from wall bounces or floating point drift |
| Restitution 1.0, friction 0 everywhere | Perfectly elastic bounces preserve puck behavior |
| BALL_SPEED = 4 | Balanced speed: visible motion without being too fast to track at 60fps |
| Use Matter.js directly instead of react-native-game-engine | Simpler, fewer dependencies, requestAnimationFrame loop is sufficient |
| Ball overlap check uses AABB expansion instead of Matter.js sensors | More reliable, avoids sensor quirks |
| After teleport, puck keeps moving while user places next exit | Continuous motion via simActiveRef decoupled from gameState |
| Portals rendered as colored bars flush with arena wall | Simple, clear visual indicator |
| Entry portal is dynamic state (not constant) for perpetual loop | Exit becomes entry after each teleport |
| MIN_PORTAL_DISTANCE = 40px prevents exit overlapping entry | Avoids degenerate teleport loops |
| Tap coordinates use locationX/locationY | Reliable relative coordinates without measureInWindow |
| Fixed timestep 16.67ms (60fps) for Matter.js | Deterministic feel |
| Re-seed velocity to (0, BALL_SPEED) if speed ~0 | Prevents puck from getting stuck |
