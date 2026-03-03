# Portal Drop — React Native Physics Puzzle Game

## Overview
Portal Drop is a 2D physics puzzle prototype built with Expo + React Native + Matter.js. Players place portals on arena boundaries, drop a ball, and watch it teleport between portals with velocity rotation based on wall normals. Features a perpetual loop mechanic where each exit portal becomes the next entry portal.

## Architecture
- **Frontend**: Expo React Native (single screen, no tabs)
- **Backend**: Express server (serves landing page only, no API needed for game)
- **Physics**: Matter.js (pure JS physics engine, no native dependencies)
- **Rendering**: React Native Views with absolute positioning (no canvas/WebGL)

## File Structure
```
app/
  _layout.tsx         # Root layout with fonts, providers, StatusBar
  index.tsx           # Main game screen (game loop, rendering, input)
src/
  constants.ts        # Arena dimensions, physics constants, types
  math.ts             # Vector math (signedAngle, rotateVec, magnitude, scale)
  snap.ts             # Snap-to-perimeter algorithm
  physics.ts          # Matter.js world setup, ball control
docs/
  PORTAL_DROP_RN_SPEC.md  # SSOT specification document
constants/
  colors.ts           # Dark sci-fi color theme
```

## Game Mechanics
- **States**: PlacingPortal → Ready → Running → PlacingNextExit → Running → ...
- **Perpetual motion**: After teleport, ball keeps bouncing (sim stays active via simActiveRef). User places next exit while ball moves — no second DROP needed.
- **Teleport**: Velocity rotated by signed angle between entry/exit portal normals, speed preserved
- **Ball physics**: Dynamic body, frozen via gravity=0 (not isStatic). RAF loop runs continuously, physics steps gated by simActiveRef.
- **Portal placement**: Tap near arena edge, snaps to nearest wall, clamped from corners. Allowed during all states except initial.

## Dependencies
- matter-js (2D physics)
- @expo-google-fonts/inter (typography)
- expo-haptics (tactile feedback on native)
- @expo/vector-icons (UI icons)

## Running
- Frontend: `npm run expo:dev` (port 8081)
- Backend: `npm run server:dev` (port 5000)
