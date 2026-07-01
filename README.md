# Game of Words (formerly Game of Worlds)

A turn-based multiplayer space strategy game where players compete to dominate the galaxy through colonization, research, and tactical combat.

![screenshot](https://github.com/steveseguin/Game-of-Worlds/blob/master/public/images/sample.jpg?raw=true)

## Overview

Originally built in 2012 as a PHP-based web game, Game of Worlds has been completely rewritten in Node.js with modern web technologies. This real-time turn-based strategy game combines the depth of classic 4X games with the accessibility of browser-based gaming.

## Features

- **12 Unique Races**: Each with distinct abilities and playstyles
- **Turn-Based Strategy**: Plan your moves carefully in 3-minute turns
- **Multiplayer Battles**: Compete against other players in real-time
- **Tech Tree**: Research advanced technologies to gain an edge
- **Resource Management**: Balance metal, crystal, and research production
- **Premium Content**: Optional balanced race unlocks and cosmetics only; no paid gameplay advantage
- **Cross-Platform**: Play in any modern web browser

## Technology Stack

- **Backend**: Node.js with WebSocket for real-time communication
- **Database**: MySQL for persistent game state
- **Frontend**: Vanilla JavaScript with HTML5 Canvas
- **Payments**: Stripe integration planned for premium races and cosmetics
- **Hosting**: Deployable to any Node.js hosting service

## Project Structure

```
Game-of-Worlds/
|-- server/              # Server-side code
|   |-- index.js         # Main server entry point
|   |-- server.js        # Game logic implementation
|   |-- setup.js         # Database setup script
|   `-- lib/             # Server modules
|       |-- ai.js        # AI opponent system
|       |-- combat.js    # Combat mechanics
|       |-- diplomacy.js # Alliance system
|       |-- map.js       # Map generation
|       |-- payments.js  # Payment processing
|       |-- races.js     # Race definitions
|       |-- security.js  # Input validation
|       |-- tech.js      # Technology tree
|       `-- victory.js   # Victory conditions
|-- public/              # Client-side files
|   |-- landing.html     # Landing page
|   |-- game.html        # Main game interface
|   |-- js/              # Client JavaScript
|   |-- css/             # Stylesheets
|   `-- images/          # Game assets
|-- docs/                # Documentation
|   `-- art-direction/   # Visual direction references and concept bitmaps
|-- tests/               # Unit and integration tests
|-- package.json         # Node dependencies
`-- .env.example         # Environment config template
```

## Quick Start

### Prerequisites
- Node.js (v18 or higher)
- MySQL (v5.7 or higher), unless you use `USE_MOCK_DB=true`
- npm or yarn

On macOS, install Node from `nodejs.org` or with Homebrew:

```bash
brew install node
```

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/steveseguin/Game-of-Worlds.git
   cd Game-of-Worlds
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   # For local development without MySQL, set USE_MOCK_DB=true
   # Edit .env with database and Stripe credentials when needed
   ```

4. Setup database:
   ```bash
   # Optional when using npm run dev:mock
   npm run setup
   # Follow prompts to create MySQL database tables
   
   # For payment features (optional):
   mysql -u root game < server/setup-payments.sql
   ```

5. Start the server:
   ```bash
   npm run dev:mock
   # Server runs on http://localhost:3000 by default with an in-memory DB
   ```

## Gameplay

### Getting Started
1. Register a new account
2. Join or create a game lobby
3. Select your starting race
4. Wait for other players to join
5. Game creator starts the match

### Core Mechanics
- **Colonization**: Use colony ships to claim new planets
- **Resource Production**: Build extractors and refineries
- **Military**: Construct various ship types for defense and conquest
- **Research**: Unlock new technologies and ship types
- **Diplomacy**: Deferred; near-term play is focused on exploration, economy, movement, and combat

### Victory Conditions
Win by achieving any of these conditions:
- Control a configured share of colonizable worlds
- Eliminate all opponents
- Reach the scientific tech objective
- Reach the economic objective
- Win the deterministic time-limit tiebreaker

## Development

### Running in Development Mode
```bash
npm run dev:mock
# Uses nodemon with USE_MOCK_DB=1 for local gameplay without MySQL
```

For real MySQL-backed development, configure `.env`, run `npm run setup`, then use `npm run dev:mysql`.

### Testing
```bash
npm test
npm run test:integration
```

`npm run test:integration` starts the app with `USE_MOCK_DB=1`, so it does not require MySQL. Browser E2E tests are available with `npm run test:e2e` after Playwright browsers are installed.

The E2E runner starts and stops a local mock server itself and works on macOS, Windows, and Linux.

### Payment Testing
See `docs/TESTING_PAYMENTS.md` for comprehensive payment testing guide.

### Art Direction
See `docs/art-direction/` for the command-station visual direction: fixed bitmap-inspired UI, living tactical space map, and commander/status-feed concepts.

## Contributing

This is an open project and all help is welcome. Start with the `stable` branch for contribution work.

1. Fork the repository
2. Create your feature branch from `stable` (`git checkout stable && git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, test, and pull request expectations.

Server-side pull requests are fine. Pull requests run CI only; accepted pushes to `master`, `main`, or `stable` run the production Server Deploy workflow automatically when app files change. That workflow installs dependencies, runs `npm test`, runs `npm run test:integration`, deploys over SSH, restarts the service, and verifies `/health` and `/status`.

Maintainers can also run `Actions -> Server Deploy -> Run workflow` to redeploy a specific branch, tag, or SHA. The live server exposes deployment metadata at `/status` and `/debug/deploy`.

## License

This project is licensed under the MIT License.

## Credits

- Original PHP version (2012) by Steve Seguin
- Node.js rewrite (2024) by Steve Seguin with AI assistance
- Domain: gameofworlds.com (currently being updated)

## Support

- Report bugs: [GitHub Issues](https://github.com/steveseguin/Game-of-Worlds/issues)
- Character stories, tech trees, and product roadmap available on request
