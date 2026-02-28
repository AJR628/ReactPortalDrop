# Portal Drop — React Native Spec (SSOT)

## Overview
Portal Drop is a 2D physics puzzle prototype. The player places an exit portal on the arena boundary, drops a ball, and the ball teleports from a fixed entry portal to the placed exit portal with velocity rotated according to portal normals.

## Game States
- **PlacingPortal**: Initial state. User taps arena boundary to place exit portal. Ball is frozen at spawn.
- **Ready**: Exit portal has been placed. User can reposition it or press Start.
- **Running**: Ball is dropping under gravity. Physics active. Teleportation enabled.
- Reset returns to **Ready** (keeping last exit portal position).

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

## Teleport Rule (Authoritative)
```
angle = signedAngle(entryNormal, exitNormal)
vOut = rotate(vIn, angle)
speed is preserved (normalize vOut to original speed magnitude)
teleportPosition = exitPortalCenter + exitNormal * (ballRadius + 5)
cooldown = 150ms
```

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
4. Clamp along-edge coordinate by `margin = portalLength/2 + cornerMargin`.
   - `cornerMargin = 16px`
5. Quantization: OFF by default.

## Critical Rules
- Teleport triggers ONLY on entry portal overlap. Exit portal does NOT teleport.
- Ball is frozen (Matter.js `isStatic: true`) until Start is pressed.
- Gravity is 0 until Running state; set to `{ y: 1 }` on Start.
- Arena tap handler only fires inside the arena Pressable.
- Cooldown prevents re-teleport for 150ms after each teleport.

## Script Responsibilities
| File | Purpose |
|------|---------|
| `src/constants.ts` | Arena dimensions, physics constants, portal defaults |
| `src/math.ts` | Vector rotation, signed angle, magnitude |
| `src/snap.ts` | Snap-to-perimeter algorithm |
| `src/physics.ts` | Matter.js engine creation, ball start/reset/teleport |
| `app/index.tsx` | Main game screen, rendering, game loop, input |

## Acceptance Checks
1. Tap inside arena near an edge → exit portal snaps to nearest edge, clamped from corners.
2. Press Start → ball drops from spawn under gravity.
3. Ball overlaps entry portal → teleports to exit portal with rotated velocity.
4. Press Reset → ball returns to spawn, physics frozen, repeatable.

## Non-Goals (MVP)
- No level system
- No scoring
- No particles or sound
- No backend, auth, ads, purchases
- No navigation or multiple screens

## Decision Log
| Decision | Rationale |
|----------|-----------|
| Use Matter.js directly instead of react-native-game-engine | Simpler, fewer dependencies, requestAnimationFrame loop is sufficient |
| Ball overlap check uses AABB expansion instead of Matter.js sensors | More reliable, avoids sensor quirks |
| Reset preserves exit portal position | Better UX for iterating on portal placement |
| Portals rendered as colored bars flush with arena wall | Simple, clear visual indicator |
| Entry portal positioned 10px inside bottom wall | Ensures ball overlap during bounce |
| Fixed timestep 16.67ms (60fps) for Matter.js | Deterministic feel |
