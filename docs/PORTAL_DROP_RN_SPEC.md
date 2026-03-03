# Portal Drop — React Native Spec (SSOT)

## Overview
Portal Drop is a 2D physics puzzle prototype with a perpetual loop mechanic. The player places an exit portal on the arena boundary, drops a ball, and the ball teleports from the entry portal to the exit portal with velocity rotated according to portal normals. After each teleport, the exit portal becomes the new entry portal.

## Game States
- **PlacingPortal**: Initial state. User taps arena boundary to place exit portal. Ball is frozen at spawn.
- **Ready**: Exit portal has been placed. User can reposition it or press Drop.
- **Running**: Ball is dropping under gravity. Physics active. Teleportation enabled.
- **PlacingNextExit**: After a successful teleport. The previous exit is now the entry. User places the next exit portal.
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

## Ball Physics (Authoritative)
- Ball is created as a **dynamic** body (never `isStatic: true`).
- Freeze is achieved by setting `engine.gravity.y = 0` and zeroing velocity.
- On DROP: reset position to spawn, zero velocity, set `engine.gravity.y = 1`, start stepping.
- On RESET: set `engine.gravity.y = 0`, zero velocity, move to spawn, clear cooldown.

## Teleport Rule (Authoritative)
```
angle = signedAngle(entryNormal, exitNormal)
vOut = rotate(vIn, angle)
speed is preserved (normalize vOut to original speed magnitude)
teleportPosition = exitPortalCenter + exitNormal * (ballRadius + 5)
cooldown = 150ms
```

Minimum ball speed for teleport: 0.5 (avoids teleporting a near-stationary ball).

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
2. Ball velocity is zeroed and gravity disabled (ball freezes at teleport position).
3. Game state transitions to `PlacingNextExit`.
4. User places a new exit portal and presses DROP to repeat.
5. Ball always drops from the spawn point (top center).

### Placement constraint
Exit portal must be at least `MIN_PORTAL_DISTANCE` (40px) from the current entry portal. Placements too close are ignored.

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
- Ball is created dynamic; freeze is via gravity = 0 + velocity = 0 (NOT isStatic).
- Arena tap handler uses `locationX`/`locationY` for coordinates relative to the arena.
- Cooldown prevents re-teleport for 150ms after each teleport.
- After teleport, gravity is disabled and ball freezes until next DROP.

## Script Responsibilities
| File | Purpose |
|------|---------|
| `src/constants.ts` | Arena dimensions, physics constants, portal defaults, game states |
| `src/math.ts` | Vector rotation, signed angle, magnitude |
| `src/snap.ts` | Snap-to-perimeter algorithm |
| `src/physics.ts` | Matter.js engine creation, ball start/reset/teleport |
| `app/index.tsx` | Main game screen, rendering, game loop, input, perpetual loop |

## Acceptance Checks
1. Tap inside arena near an edge → exit portal snaps to nearest edge, clamped from corners.
2. Press Drop → ball drops from spawn under gravity.
3. Ball overlaps entry portal → teleports to exit portal with rotated velocity.
4. After teleport, UI shows "Place next exit"; placing + DROP repeats the cycle.
5. Reset always returns to initial state; ball always drops after reset.
6. Exit on left wall → ball exits moving rightward. Exit on top → ball exits moving downward.

## Non-Goals (MVP)
- No level system
- No scoring beyond turn counter
- No particles or sound
- No backend, auth, ads, purchases
- No navigation or multiple screens

## Decision Log
| Decision | Rationale |
|----------|-----------|
| Use Matter.js directly instead of react-native-game-engine | Simpler, fewer dependencies, requestAnimationFrame loop is sufficient |
| Ball overlap check uses AABB expansion instead of Matter.js sensors | More reliable, avoids sensor quirks |
| Ball created dynamic, frozen via gravity=0 | `setStatic(false)` is unreliable in matter-js; gravity toggle is deterministic |
| After teleport, ball freezes and drops from spawn on next DROP | Consistent behavior regardless of exit portal position |
| Portals rendered as colored bars flush with arena wall | Simple, clear visual indicator |
| Entry portal is dynamic state (not constant) for perpetual loop | Exit becomes entry after each teleport |
| MIN_PORTAL_DISTANCE = 40px prevents exit overlapping entry | Avoids degenerate teleport loops |
| Tap coordinates use locationX/locationY | Reliable relative coordinates without measureInWindow |
| Fixed timestep 16.67ms (60fps) for Matter.js | Deterministic feel |
| Ball speed minimum 0.5 for teleport trigger | Prevents teleporting a near-stationary ball |
