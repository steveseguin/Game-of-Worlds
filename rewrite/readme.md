# Galaxy Conquest

A multiplayer, turn-based strategy game of galactic conquest featuring:
- Real-time turn-based gameplay
- Technology research and evolution
- Planetary colonization and resource management
- Economic development
- Warfare with diverse ship types
- Spying and intelligence gathering

## Setup Instructions

1. Install Dependencies:
```
npm install websocket mysql2
```
2. Database Setup:
```
node setup.js
```
Follow the prompts to create a new game.

3. Start the Server:
```
node index.js
```
4. Access the Game:
Open your browser and go to http://localhost:1337

## Game Mechanics

### Resources
- Metal: Used for constructing buildings and ships
- Crystal: Used for movement and special operations
- Research: Used for technology advancement

### Buildings
- Metal Extractor: Produces metal
- Crystal Refinery: Produces crystal
- Research Academy: Produces research points
- Spaceport: Enables ship construction
- Orbital Turret: Provides defense
- Warp Gate: Enables advanced transport

### Ships
- Scout: Fast reconnaissance ship
- Frigate: Basic combat vessel
- Destroyer: Medium warship
- Cruiser: Heavy combat ship
- Battleship: Capital ship
- Colony Ship: Required for planet colonization
- Dreadnought: Ultimate battleship
- Intruder: Stealth combat ship
- Carrier: Fleet support vessel

### Technology
- Multiple research paths for weapons, shields, and resource production
- Unlock advanced ships and buildings

### Combat
- Tactical ship-to-ship combat
- Different ships have different capabilities
- Orbital defenses protect planets

## Credits
Created by Steve Seguin