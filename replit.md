# Portal Drop — React Native Physics Puzzle Game

## Overview
Portal Drop is a 2D physics puzzle prototype built with Expo + React Native + Matter.js. Two portals (A and B) sit on the arena boundary. A constant-velocity puck bounces off walls and teleports bidirectionally between portals. After each teleport, taps move the opposite portal. No gravity.

## Architecture
- **Frontend**: Expo React Native (single screen, no tabs)
- **Backend**: Express server (serves landing page only, no API needed for game)
- **Physics**: Matter.js (pure JS physics engine, no native dependencies)
- **Rendering**: React Native Views with absolute positioning (no canvas/WebGL)

## File Structure
```
app/
  _layout.tsx         # Root layout with fonts, providers, StatusBar
  index.tsx           # Main game screen (game loop, rendering, input, room transitions)
src/
  constants.ts        # Arena dimensions, physics constants, PortalId type
  math.ts             # Vector math (signedAngle, rotateVec, magnitude, scale)
  snap.ts             # Snap-to-perimeter algorithm
  physics.ts          # Matter.js world setup, ball control, obstacle management
  levels.ts           # 8 level definitions (goal doorway + obstacles per room)
docs/
  PORTAL_DROP_RN_SPEC.md  # SSOT specification document
constants/
  colors.ts           # Dark sci-fi color theme (portals, goal green, obstacles)
```

## Game Mechanics
- **States**: PlacingPortal → Ready → Running (stays running)
- **Portal system**: Two-way pair. Portal A (blue, bottom) and Portal B (purple, right). Both always active.
- **Bidirectional teleport**: Enter A → exit B. Enter B → exit A. Velocity rotated by signed angle, normalized to BALL_SPEED.
- **Alternating taps**: Each tap alternates which portal moves (A→B→A→...). After teleport, first tap targets the exit portal. Default: taps move B.
- **Motion model**: Constant-velocity puck (BALL_SPEED=4). No gravity. Velocity normalized every tick.
- **Wall bounce**: Elastic (restitution 1.0, friction 0). Straight-line bounces.
- **Safety**: Cannot place portal within 40px of other portal or puck.
- **Rooms**: 8 levels with increasing obstacles. Green doorway on right wall advances to next room.
- **Room transition**: Slide animation (300ms each direction). Puck velocity preserved across rooms.
- **Obstacles**: Static Matter.js rectangles that bounce the puck. Added/removed per level.
- **Win**: "YOU WIN!" overlay after clearing all 8 rooms. RESET returns to Room 1.

## Dependencies
- matter-js (2D physics)
- @expo-google-fonts/inter (typography)
- expo-haptics (tactile feedback on native)
- @expo/vector-icons (UI icons)

## Running
- Frontend: `npm run expo:dev` (port 8081)
- Backend: `npm run server:dev` (port 5000)
