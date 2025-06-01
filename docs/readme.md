# Galaxy Conquest (Game of Worlds Rewrite)

A multiplayer, turn-based strategy game of galactic conquest featuring:
- Real-time turn-based gameplay with WebSocket communication
- Technology research and evolution
- Planetary colonization and resource management
- Economic development
- Warfare with diverse ship types
- Spying and intelligence gathering

## Prerequisites

- Node.js (v14 or higher)
- MySQL Server
- npm

## Setup Instructions

1. Install Dependencies:
```bash
npm install websocket mysql2
```

2. Database Setup:
```bash
node setup.js
```
Follow the prompts to:
- Create the database and tables
- Create a new game (optional)
- Set up initial game parameters

3. Start the Server:
```bash
node index.js
```

4. Access the Game:
Open your browser and go to http://localhost:1337/login.html

## How to Play

1. **Register/Login**: Create a new account on the login page
2. **Join a Game**: From the lobby, join an existing game or wait for one to be created
3. **Start Playing**: Once the game creator starts the game:
   - You'll start with a homeworld and initial resources
   - Build structures to generate more resources
   - Research technologies to unlock new capabilities
   - Build ships for exploration and combat
   - Colonize new planets to expand your empire
   - Engage in strategic battles with other players

## Game Mechanics

### Resources
- **Metal**: Used for constructing buildings and ships
- **Crystal**: Used for fleet movement and special operations
- **Research**: Used for technology advancement

### Buildings
- **Metal Extractor**: Produces metal resources
- **Crystal Refinery**: Produces crystal resources
- **Research Academy**: Produces research points
- **Spaceport**: Enables ship construction
- **Orbital Turret**: Provides planetary defense
- **Warp Gate**: Enables advanced transport capabilities

### Ships
- **Scout**: Fast reconnaissance ship for exploration
- **Frigate**: Basic combat vessel
- **Destroyer**: Medium warship with balanced capabilities
- **Cruiser**: Heavy combat ship
- **Battleship**: Capital ship with strong firepower
- **Colony Ship**: Required for planet colonization
- **Dreadnought**: Ultimate battleship
- **Intruder**: Stealth combat ship
- **Carrier**: Fleet support vessel

### Technology Tree
Research technologies to:
- Unlock advanced ship types
- Improve resource production
- Enhance combat capabilities
- Enable special abilities like probing

### Combat System
- Automated tactical ship-to-ship combat
- Different ships have unique strengths and weaknesses
- Orbital defenses protect planets from invasion
- Battles resolve at the end of each turn

### Turn System
- Each turn lasts 3 minutes
- Actions can be queued during the turn
- Combat and resource generation occur at turn end
- Turn timer displays remaining time

## Architecture

### Backend
- **index.js**: HTTP server and WebSocket handler
- **server.js**: Core game logic and command processing
- **setup.js**: Database initialization script

### Game Mechanics (lib/)
- **map.js**: Map generation and sector management
- **combat.js**: Battle resolution system
- **tech.js**: Technology tree definitions
- **database.js**: Database abstraction layer

### Frontend
- **login.js**: Authentication handling
- **connect.js**: WebSocket communication
- **game.js**: Main game initialization
- **ui.js**: User interface management
- **minimap.js**: Map visualization
- **battle.js**: Battle animations
- Other modules for specific UI components

## Development Notes

- Server runs on port 1337
- WebSocket connection established automatically on login
- Game state persisted in MySQL database
- Each game has its own set of tables (map, players, ships, buildings)
- Placeholder SVG images used for missing assets

## Troubleshooting

- **Can't connect to database**: Ensure MySQL is running and credentials in setup.js are correct
- **WebSocket connection failed**: Check that port 1337 is not in use
- **Missing images**: Run `node create-placeholders.js` to generate placeholder assets
- **Login issues**: Ensure cookies are enabled in your browser

## Credits
Created by Steve Seguin
Node.js rewrite completed with full functionality