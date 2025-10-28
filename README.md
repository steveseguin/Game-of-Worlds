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
- **Premium Content**: Optional purchases for cosmetic items and convenience features
- **Cross-Platform**: Play in any modern web browser

## Technology Stack

- **Backend**: Node.js with WebSocket for real-time communication
- **Database**: MySQL for persistent game state
- **Frontend**: Vanilla JavaScript with HTML5 Canvas
- **Payments**: Stripe integration for premium features
- **Hosting**: Deployable to any Node.js hosting service

## Project Structure

```
Game-of-Worlds/
├── server/              # Server-side code
│   ├── index.js        # Main server entry point
│   ├── server.js       # Game logic implementation
│   ├── setup.js        # Database setup script
│   └── lib/            # Server modules
│       ├── ai.js       # AI opponent system
│       ├── combat.js   # Combat mechanics
│       ├── diplomacy.js # Alliance system
│       ├── map.js      # Map generation
│       ├── payments.js # Payment processing
│       ├── races.js    # Race definitions
│       ├── security.js # Input validation
│       ├── tech.js     # Technology tree
│       └── victory.js  # Victory conditions
├── public/             # Client-side files
│   ├── landing.html   # Landing page
│   ├── game.html      # Main game interface
│   ├── js/            # Client JavaScript
│   ├── css/           # Stylesheets
│   └── images/        # Game assets
├── mysql_data/        # MySQL database files
├── docs/              # Documentation
├── package.json       # Node dependencies
└── .env.example       # Environment config template
```

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- MySQL (v5.7 or higher)
- npm or yarn

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
   # Edit .env with your database and Stripe credentials
   ```

4. Setup database:
   ```bash
   npm run setup
   # Follow prompts to create database tables
   
   # For payment features (optional):
   mysql -u root game < server/setup-payments.sql
   ```

5. Start the server:
   ```bash
   npm start
   # Server runs on http://localhost:1337
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
- **Diplomacy**: Form alliances or declare war on other players

### Victory Conditions
Win by achieving any of these conditions:
- Control 75% of the galaxy
- Research all technologies
- Accumulate massive resources
- Build the wonder structure
- Eliminate all opponents

## Development

### Running in Development Mode
```bash
npm run dev
# Uses nodemon for auto-restart on changes
```

### Testing
```bash
npm test
```

### Payment Testing
See `docs/TESTING_PAYMENTS.md` for comprehensive payment testing guide.

## Contributing

This is an open project and all help is welcome! 

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Credits

- Original PHP version (2012) by Steve Seguin
- Node.js rewrite (2024) by Steve Seguin with AI assistance
- Domain: gameofworlds.com (currently being updated)

## Support

- Report bugs: [GitHub Issues](https://github.com/steveseguin/Game-of-Worlds/issues)
- Character stories, tech trees, and product roadmap available on request
