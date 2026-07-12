# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

# Game of Words - Developer Guide

A turn-based multiplayer space strategy game with 12 unique races, real-time WebSocket communication, and persistent MySQL state.

## Original Design Philosophy

**The 2012 original was built around RISK and REWARD.** Players faced meaningful consequences for exploration:
- Probing dangerous sectors risked probe destruction
- Moving into black holes meant certain fleet annihilation
- Asteroid belts dealt random damage, but controlling them made them safe
- Unknown sectors held both opportunity and danger
- Exploration was a strategic decision, not a certainty

This **risk/reward personality** made the game compelling. Recent rewrites stripped these mechanics away, making exploration consequence-free and removing the tension that made exploration meaningful. **Goal: Restore these core mechanics while keeping the modern architecture.**

## Visual Art Direction

Future major UI work should check `docs/art-direction/` first. The desired direction is a fixed, intentional 2D command-station interface: bitmap-inspired, shader-assisted, and alive through subtle animation. Use the mech bay and commander briefing mood as inspiration, but do not copy source artwork or the low-poly battle aesthetic from that era.

Key visual targets:
- A permanent command console composition, not generic responsive web cards
- A central tactical space/sensor viewport with stars, galaxies, suns, planets, black holes, fog, and fleet paths
- Embedded commander/status-feed panels for important game updates
- Localized animation such as sparks, cable sway, scanlines, monitor glow, waveform bars, and warning lamps
- 2D painterly or pre-rendered feel with modern polish, not a 3D battle viewer

## Quick Start

### Development Setup
```bash
npm install                    # Install dependencies
cp .env.example .env          # Copy environment template
npm run dev:mock              # Start with auto-reload + mock DB (port 3000 by default)
```

### Running Tests
```bash
npm test                      # Run all unit tests (tests/*.test.js)
npm run test:integration      # Run mock HTTP/WebSocket integration smoke
npm run test:e2e              # Run Playwright against a local mock server on port 4173
node --test tests/races.test.js  # Run a specific unit test file
```

### Database Setup (First Time Only)
```bash
npm run setup                 # Run setup.js to initialize MySQL tables
mysql -u root game < server/setup-payments.sql  # Optional: payment features
```

## Architecture

For an AI-readable flow map, start with `docs/agents/README.md`. That folder documents the live HTTP API, WebSocket signaling, runtime/persistent state, user journey, turn engine, CI/CD, and current risk register. Keep those docs updated when changing gameplay flow, server endpoints, wire messages, or deployment behavior.

### Backend (Node.js + WebSocket)
- **server/index.js** - HTTP server entry point, sets up file serving and database pooling
- **server/server.js** - WebSocket server with main game loop, turn management, and game state
- **server/lib/** - Modular game mechanics:
  - `races.js` - Race definitions (12 unique races with bonuses)
  - `combat.js` - Battle simulation and damage calculation
  - `tech.js` - Technology tree and research mechanics
  - `map.js` - Galaxy map generation and planet management
  - `diplomacy.js` - Alliance and diplomacy system
  - `victory.js` - Victory conditions and game cleanup
  - `ai.js` - AI opponent logic
  - `payments.js` & `payment-endpoints.js` - Stripe integration
  - `database.js` - In-memory DB (used in tests)
  - `security.js` - Input validation
  - `sync.js` - Client state synchronization

### Frontend (Vanilla JavaScript + HTML5 Canvas)
- **public/landing.html** - Game homepage and login
- **public/lobby.html** - Game browser and creation
- **public/game.html** - Main game interface with Canvas
- **public/js/** - Client-side game logic:
  - `main.js` - Core game rendering and mechanics
  - `build.js` - Building/construction system
  - `chat.js` - Multiplayer chat
  - `shop.js` - Premium shop interface
  - Other modules for UI, events, tech tree, etc.
- **public/css/** - Styling for all pages
- **public/images/** - Game assets (ships, planets, UI elements)

### Real-Time Communication
The game uses WebSocket for real-time updates between client and server. The server broadcasts game state changes to all connected players in an active game, enabling simultaneous turn-based gameplay.

### Game State Management
- **Shared across server**: Maintained in `gameState` object exported from server.js
- **Per-game**: Player resources, tech levels, military units, planet control
- **Per-client**: Canvas viewport, UI state, received messages
- **Persistent**: MySQL database stores game history and user accounts

### Environment Configuration
Copy `.env.example` to `.env` and configure:
- **Database**: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_POOL_SIZE
- **Server**: PORT (default 3000), NODE_ENV
- **Security**: SESSION_SECRET, CSRF_SECRET (auto-generated in development)
- **Payments**: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (optional)
- **Features**: ENABLE_ANALYTICS, ENABLE_DEBUG_LOGS, USE_MOCK_DB
- **Email**: SMTP_* (optional)

The `env-validator.js` runs at startup and validates all required variables. In development, missing security secrets are auto-generated.

### Testing
- **Unit tests** (`tests/*.test.js`) - Test individual modules (races, security, AI logic)
- **Integration smoke** (`npm run test:integration` or `npm run smoke`) - Starts `server/index.js` with `USE_MOCK_DB=1`; no local MySQL required
- **E2E tests** (`tests/e2e/*.spec.js`) - Full game playthrough tests
- **E2E runner** (`tools/run-e2e.js`) - Starts `server/index.js` with `USE_MOCK_DB=1`, runs Playwright serially, writes screenshots to ignored `test-results/`, then stops the local server
- **Local mock dev** (`npm run dev:mock`) - Cross-platform launcher for macOS, Windows, and Linux contributors; no shell-specific env syntax or local MySQL required
- **Mock database** - Use `USE_MOCK_DB=true` for testing without MySQL

## Stable Branch & Contributor Prep

- The `stable` branch is the friend-ready contribution baseline. When Steve asks for a stable branch, create or update `stable`, include existing dirty working-tree changes unless Steve explicitly excludes them, run `npm test` and `npm run test:integration`, then push `stable`.
- Contributors should branch from `stable` and open pull requests back into `stable` unless Steve asks for a different target.
- Keep contributor-facing setup current in `README.md`, `CONTRIBUTING.md`, `.env.example`, and `.github/pull_request_template.md`.
- Keep `.github/workflows/ci.yml` green for contributor PRs. Pull requests test only; accepted pushes to `master`, `main`, or `stable` run the `Server Deploy` workflow automatically when app files change.
- External fork PRs should not deploy production. Trusted maintainers with push access can deploy by merging/pushing to the deploy branches or by manually running `Actions -> Server Deploy -> Run workflow`.

## Common Tasks

### Adding Game Mechanics
1. Create module in `server/lib/` (e.g., `new-mechanic.js`)
2. Export functions that operate on game state
3. Call from `server.js` game loop as needed
4. Add unit tests in `tests/new-mechanic.test.js`

### Adding a Race
Edit `server/lib/races.js` - add to RACE_TYPES object with:
- `id`, `name` - Unique identifier and display name
- `bonuses` - Apply to metalProduction, crystalProduction, shipCost, shipSpeed, etc.
- `unlockType`, `unlockRequirement` - For achievement-based races

### Payment Features
- Stripe integration in `server/lib/payments.js`
- Webhook handling in `server/lib/payment-endpoints.js`
- Payment testing documented in `docs/TESTING_PAYMENTS.md`

## Database Schema
Run `npm run setup` to create tables. Key tables:
- `games` - Game instances
- `users` - Player accounts
- `players` - Per-player game state
- `planets` - Colonized worlds
- `armies` - Military units
- `technologies` - Researched techs per player
- `transactions` (optional) - Payment records

## Original Game Mechanics (2012 PHP - To Be Restored)

**These mechanics made the original game compelling and must be restored for proper gameplay:**

### Exploration & Map Visibility
- ✅ DONE: Fog-of-war (players only see explored/owned sectors)
- ✅ DONE: Restore visual "fog" for unexplored sectors on client

### Hazard Mechanics
- **Black Holes (sectortype 2)**: Fleet enters → INSTANT ANNIHILATION
  - All ships destroyed immediately
  - Message: "Fleet arrived in sector X... but the sector contained a blackhole! UH-OH! Our fleet was crushed by the immense gravity!"
  - No escape, no partial losses

- **Asteroid Belts (sectortype 1)**: Random damage on entry
  - Each ship ~50% chance destruction: `Math.round(shipCount * Math.random())`
  - Three outcomes with narrative messages:
    - **Total loss**: "We lost our entire fleet!"
    - **Partial loss**: "We lost X ships. If we can control the sector though, that won't happen again."
    - **Escape**: "We avoided being hit. Whew!"
  - **KEY**: Once YOU OWN the sector, it becomes safe - no more hazard damage
  - Strategic depth: Players must "secure" dangerous sectors to use them as safe transit routes

### Probe Mechanics
- **Cost**: 300 crystals per probe
- **Risk**: Probes can be destroyed by asteroid belts, black holes, and enemy counter-intelligence
  - Probing black holes destroys probe with message: "Our probe was destroyed in sector X"
  - Probing asteroids risks destruction
  - Probing planets is safe and reveals resources
- **Information discipline**: A destroyed probe reports where telemetry ended, not what destroyed it. A successful probe reveals a dated sector snapshot without fleet risk.

### Fleet Movement & Colonization
- **Original auto-colonization**: The 2012 implementation transferred eligible territory on arrival. The current game requires an explicit colonization action for planets, a Colony Ship, and sufficient terraform capability; empty space and surviving asteroid entries can still establish route control.
  - Hazard damage applied first (if asteroid/black hole)
  - Surviving fleet takes control of sector
  - Can immediately build on newly taken sectors
- **Ownership Matters**: 
  - You control asteroid belts → fleets pass safely
  - You control planets → can extract resources
  - You control black hole sectors → still dangerous, avoid them

### Sector Type Hierarchy
```
0  = Empty Space (safe, no resources, not colonizable)
1  = Asteroid Belt (hazard: random damage, safe if owned)
2  = Black Hole (hazard: instant fleet death)
3-5 = Other non-colonizable hazards
6-9 = Colonizable Planets (increasing resource multipliers)
10 = Homeworld (player's starting sector)
```

### Messaging & Flavor
- Original had rich narrative messages for each hazard outcome
- Current implementation uses generic responses
- Hazard messages should convey danger and make losses feel meaningful

## Performance Notes
- Database uses connection pooling (default 10 connections)
- WebSocket broadcasts use efficient JSON serialization
- Turn length is 3 minutes; game loop updates all active games
- Canvas rendering optimized for 6+ players

## IMPORTANT: Deployment Workflow

**ALWAYS deploy and test on production after code changes. The user does NOT test locally.**

After making any code changes:
1. Run relevant local validation (`npm test`, `npm run test:integration`, plus E2E/screenshots for UI changes).
2. Push accepted changes to `stable`, `master`, or `main` so GitHub Actions can run CI/CD automatically.
3. For immediate Codex-owned deploys, run `node tools/deploy.js` locally after validation.
4. Verify server is running and smoke test production, including `/health` or `/status`.

### Secrets & Deployment

Production server credentials are stored in:
```
secrets/readme/claude/agents/ssh
```
This is the credential file used by `tools/deploy.js` for SSH deployment.

GitHub Actions deployment uses repository secrets:

- `PROD_SSH_HOST`
- `PROD_SSH_USER`
- `PROD_SSH_PASSWORD`

### Production Server

- Host: 140.82.4.209
- User: root
- App path: `/opt/game-of-worlds/`
- Service: `systemctl restart game-of-worlds`

### Deploy Commands

```bash
# Copy a file to production
sshpass -p 'PASSWORD' scp -o StrictHostKeyChecking=no LOCAL_FILE root@140.82.4.209:/opt/game-of-worlds/PATH

# Restart server
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no root@140.82.4.209 "systemctl restart game-of-worlds"

# Check status
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no root@140.82.4.209 "systemctl status game-of-worlds"

# Smoke test
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no root@140.82.4.209 "curl -s localhost:3000/ | head -c 100"

# Deployment metadata
curl -s https://gameofworlds.com/status
```
