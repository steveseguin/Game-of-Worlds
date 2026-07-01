# Game of Words Contributor Notes

This file is a secondary overview. For current setup and contribution workflow, start with the root `README.md` and `CONTRIBUTING.md`. For AI-readable maps of the server APIs, WebSocket protocol, state model, turn engine, deployment flow, and known risks, start with `docs/agents/README.md`.

Game of Words is a multiplayer, turn-based strategy game of galactic conquest featuring:
- Real-time turn-based gameplay with WebSocket communication
- Technology research and evolution
- Planetary colonization and resource management
- Economic development
- Warfare with diverse ship types
- Probes, fog-of-war, hazards, and risk/reward exploration

## Quick Local Setup

```bash
npm install
cp .env.example .env
```

For local development without MySQL, set this in `.env`:

```bash
USE_MOCK_DB=true
ENABLE_TEST_GAME_MODE=true
```

Then start the server:

```bash
npm run dev
```

Open `http://localhost:3000/login.html`.

For MySQL-backed development, configure the `DB_*` values in `.env`, then run `npm run setup`.

## How to Play

1. **Register/Login**: Create a new account or use guest login.
2. **Join a Game**: From the lobby, create a game or join an existing one.
3. **Choose a Race**: Pick from available races before joining.
4. **Start Playing**: Once the game creator starts the game:
   - You'll start with a homeworld and initial resources.
   - Build structures to generate more resources.
   - Research technologies to unlock new capabilities.
   - Build ships for exploration and combat.
   - Probe unknown sectors for intelligence.
   - Colonize new planets and secure hazardous routes.
   - Engage in strategic battles with other players or AI.

## Game Mechanics

### Resources
- **Metal**: Used for constructing buildings and ships.
- **Crystal**: Used for probes, fleet movement, and special operations.
- **Research**: Used for technology advancement.

### Buildings
- **Metal Extractor**: Produces metal resources.
- **Crystal Refinery**: Produces crystal resources.
- **Research Academy**: Produces research points.
- **Spaceport**: Enables ship construction.
- **Orbital Turret**: Provides planetary defense.
- **Warp Gate**: Enables advanced transport capabilities.

### Ships
- **Scout**: Fast reconnaissance ship for exploration.
- **Frigate**: Basic combat vessel.
- **Destroyer**: Medium warship with balanced capabilities.
- **Cruiser**: Heavy combat ship.
- **Battleship**: Capital ship with strong firepower.
- **Colony Ship**: Used for expansion and territory control.
- **Dreadnought**: Ultimate battleship.
- **Intruder**: Stealth combat ship.
- **Carrier**: Fleet support vessel.

### Technology Tree
Research technologies to:
- Unlock advanced ship types.
- Improve resource production.
- Enhance combat capabilities.
- Enable special abilities like probing.

### Combat System
- Automated tactical ship-to-ship combat.
- Different ships have unique strengths and weaknesses.
- Orbital defenses protect planets from invasion.
- Battles resolve through server-side combat simulation and client-side visualization.

### Turn System
- Quick games use 3-minute turns by default.
- Epic games use long turns for slower async play.
- Test mode is accelerated for development.
- Combat and resource generation occur at turn end.

## Architecture

### Backend
- `server/index.js`: HTTP server, static file serving, API routes, and WebSocket startup.
- `server/server.js`: Core game command routing, lobby handling, and turn processing.
- `server/setup.js`: Database initialization script.
- `server/lib/`: Game systems such as map, movement hazards, combat, tech, races, victory, AI, security, and payments.

### Frontend
- `public/login.html`: Authentication and guest login.
- `public/lobby.html`: Game creation, joining, race selection, and waiting room.
- `public/game.html`: Main game screen.
- `public/js/connect.js`: WebSocket communication from the game screen.
- `public/js/lobby.js`: Lobby WebSocket and UI logic.
- `public/js/`: UI modules for map, combat, buildings, tech, sound, onboarding, and shop flows.

## Development Notes

- Server runs on port 3000 by default.
- WebSocket connection is established automatically after login.
- Game state persists in MySQL when configured, or in memory when `USE_MOCK_DB=true`.
- Run `npm test` and `npm run test:integration` before opening a pull request.
- Pull requests run CI only. Accepted pushes to `master`, `main`, or `stable` automatically run the production Server Deploy workflow when app files change.
- The live server exposes deployment and runtime metadata at `/health`, `/status`, and `/debug/deploy`.

## Troubleshooting

- **Can't connect to database**: Use `USE_MOCK_DB=true` for local work, or ensure MySQL is running and `.env` has the right `DB_*` values.
- **WebSocket connection failed**: Check that port 3000 is not in use.
- **Login issues**: Ensure cookies are enabled in your browser.
- **Test mode missing**: Set `ENABLE_TEST_GAME_MODE=true` in `.env`.

## Credits

Created by Steve Seguin. Node.js rewrite completed with AI assistance.
