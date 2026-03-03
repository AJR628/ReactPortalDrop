# Portal Drop — React Native Spec (SSOT)

## Overview
Portal Drop is a 2D physics puzzle prototype with a two-way portal pair system. Two portals (A and B) exist on the arena boundary at all times, both always active. A constant-velocity puck bounces off walls and teleports bidirectionally: entering Portal A exits at Portal B, and vice versa. After each teleport, taps move the opposite portal (the destination). No gravity.

## Game States
- **PlacingPortal**: Initial state. User taps arena boundary to reposition the movable portal. Puck is frozen at spawn.
- **Ready**: User has repositioned a portal. Can press LAUNCH.
- **Running**: Puck is moving at constant velocity. Bidirectional teleportation active. User can reposition the movable portal while puck moves.
- Reset returns to **PlacingPortal** (full reset to initial state).

## Portal System
### Two-Way Portal Pair
- Portal A (blue, #00AAFF) — default position: bottom wall center.
- Portal B (purple, #AA44FF) — default position: right wall center.
- Both portals are always visible and always active.

### Bidirectional Teleport
- Puck overlaps Portal A → teleports to Portal B, exits inward from B's wall.
- Puck overlaps Portal B → teleports to Portal A, exits inward from A's wall.

### Tap Alternation Rule
- While the puck is running, every tap alternates which portal is moved: tap #1 moves one, tap #2 moves the other, etc.
- Track `nextMovePortalId` ('A' | 'B'): which portal the next tap will move.
- Default `nextMovePortalId = 'B'` (pre-launch taps always move B).
- After a teleport: `nextMovePortalId` is set to the exit portal (the one the puck just came out of).
  - After A→B teleport (exit B): next tap moves B.
  - After B→A teleport (exit A): next tap moves A.
- After each successful tap placement while running: `nextMovePortalId` flips to the other portal.
- UI label shows "TAP MOVES A" or "TAP MOVES B". The next-to-move portal has a white border highlight.

### Placement Safety
- Cannot place portal within `MIN_PORTAL_DISTANCE` (40px) of the other portal.
- Cannot place portal within `MIN_PORTAL_PUCK_DIST` (40px) of the puck (while moving).

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

## Puck Physics (Authoritative)
- Motion model: constant-velocity straight trajectory (no gravity).
- `engine.gravity.y = 0` always.
- `BALL_SPEED = 4` px per physics tick. Every tick, velocity is normalized: `v = normalize(v) * BALL_SPEED`.
- If speed drops near zero, re-seed direction to `(0, BALL_SPEED)` (straight down).
- Ball body: `restitution: 1.0`, `friction: 0`, `frictionAir: 0`.
- Wall bodies: `restitution: 1.0`, `friction: 0`.
- On LAUNCH: position to spawn, set velocity `(0, BALL_SPEED)`.
- On RESET: zero velocity, move to spawn.

## Teleport Rule (Authoritative)
```
angle = signedAngle(entryNormal, exitNormal)
vOut = rotate(vIn, angle) then normalize to BALL_SPEED
if vOut speed ~0: fallback to exitNormal * BALL_SPEED
teleportPosition = exitPortalCenter + exitNormal * TELEPORT_OFFSET
TELEPORT_OFFSET = BALL_RADIUS + PORTAL_THICKNESS/2 + 2
cooldown = 150ms
```

Both portals checked each tick. First overlap wins (A checked before B).

### signedAngle
`atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)`

### rotateVec
```
x' = x * cos(angle) - y * sin(angle)
y' = x * sin(angle) + y * cos(angle)
```

## Snap-to-Boundary Algorithm
Given a tap point in arena coordinates:
1. Compute distance to each edge (top, bottom, left, right).
2. Choose nearest edge → determines `PortalSide`.
3. Snap coordinate to that edge.
4. Clamp along-edge coordinate by `margin = portalLength/2 + cornerMargin` (16px).
5. Quantization: OFF by default.

## Critical Rules
- Both portals are bidirectional sensors — overlapping either triggers teleport to the other.
- Gravity is ALWAYS off.
- Speed is forced constant every physics tick via normalization.
- Cooldown prevents re-teleport for 150ms after each teleport.
- After teleport, puck keeps moving. Taps alternate which portal is moved, starting with the exit portal.

## Script Responsibilities
| File | Purpose |
|------|---------|
| `src/constants.ts` | Arena dims, BALL_SPEED, portal defaults (A/B), PortalId type, game states |
| `src/math.ts` | Vector rotation, signed angle, magnitude |
| `src/snap.ts` | Snap-to-perimeter algorithm |
| `src/physics.ts` | Matter.js engine (zero-gravity, elastic walls), ball start/reset/teleport |
| `app/index.tsx` | Game screen, bidirectional teleport loop, alternating tap portal movement, UI |
| `constants/colors.ts` | Portal A/B colors, theme |

## Acceptance Checks
1. Press LAUNCH: puck moves straight down at constant speed.
2. Puck enters Portal A → teleports to Portal B, exits inward. Turn counter increments.
3. After exiting B, first tap moves Portal B (the exit portal). Label shows "TAP MOVES B".
4. Second tap moves Portal A. Label shows "TAP MOVES A". Continues alternating.
5. Puck bounces off walls. If it returns into B, it teleports B→A, exits A inward.
6. After exiting A, first tap moves Portal A. Alternation continues.
7. RESET restores both portals to defaults, puck to spawn, nextMovePortalId to 'B'.

## Non-Goals (MVP)
- No level system
- No scoring beyond turn counter
- No particles or sound
- No backend, auth, ads, purchases
- No navigation or multiple screens

## Decision Log
| Decision | Rationale |
|----------|-----------|
| Two-way portal pair with alternating tap control | Player can quickly reposition BOTH portals |
| Tap alternation resets to exit portal after teleport | First tap after teleport moves the portal puck just exited from |
| nextMovePortalId defaults to 'B' | Pre-launch taps move B (the portal user wants to position first) |
| Portal A checked before B on overlap | Deterministic — if both overlap (shouldn't happen), A wins |
| Constant-velocity puck, no gravity | Straight-line motion makes portal chaining predictable |
| Speed normalized every tick | Prevents energy loss/gain from bounces or drift |
| Restitution 1.0, friction 0 | Perfectly elastic bounces |
| BALL_SPEED = 4 | Balanced speed at 60fps |
| MIN_PORTAL_PUCK_DIST = 40 | Prevents placing portal on top of moving puck |
| Movable portal has white border | Visual indicator of which portal will move on tap |
