// Technology Research System for Galaxy Conquest


const TECH_CATEGORIES = {
    RESOURCE: {
        id: 1,
        name: "Resource Production",
        description: "Technologies that enhance resource gathering efficiency"
    },
    MILITARY: {
        id: 2,
        name: "Military",
        description: "Technologies that improve combat capabilities"
    },
    EXPANSION: {
        id: 3,
        name: "Expansion",
        description: "Technologies that help with colonizing and expanding your empire"
    },
    INTEL: {
        id: 4,
        name: "Intelligence",
        description: "Technologies for gathering information about other players"
    },
    PROPULSION: {
        id: 5,
        name: "Propulsion",
        description: "Technologies for ship movement and space travel"
    },
    POWER: {
        id: 6,
        name: "Power",
        description: "Energy generation technologies"
    },
    DEFENSE: {
        id: 7,
        name: "Defense",
        description: "Defensive technologies"
    },
    WEAPONS: {
        id: 8,
        name: "Weapons",
        description: "Offensive weaponry technologies"
    },
    SHIPS: {
        id: 9,
        name: "Ship Construction",
        description: "Technologies for building various ship types"
    }
};
Here's a complete implementation of the technology tree in the tech.js file:
javascriptCopy// rewrite/tech.js

/**
 * Tech categories with their properties
 */
const TECH_CATEGORIES = {
    RESOURCE: {
        id: 1,
        name: "Resource Production",
        description: "Technologies that enhance resource gathering efficiency"
    },
    MILITARY: {
        id: 2,
        name: "Military",
        description: "Technologies that improve combat capabilities"
    },
    EXPANSION: {
        id: 3,
        name: "Expansion",
        description: "Technologies that help with colonizing and expanding your empire"
    },
    INTEL: {
        id: 4,
        name: "Intelligence",
        description: "Technologies for gathering information about other players"
    },
    PROPULSION: {
        id: 5,
        name: "Propulsion",
        description: "Technologies for ship movement and space travel"
    },
    POWER: {
        id: 6,
        name: "Power",
        description: "Energy generation technologies"
    },
    DEFENSE: {
        id: 7,
        name: "Defense",
        description: "Defensive technologies"
    },
    WEAPONS: {
        id: 8,
        name: "Weapons",
        description: "Offensive weaponry technologies"
    },
    SHIPS: {
        id: 9,
        name: "Ship Construction",
        description: "Technologies for building various ship types"
    }
};

/**
 * Technology definitions
 */
const TECHNOLOGIES = {
    // Basic Resource Technologies
    METAL_PRODUCTION: {
        id: 1,
        name: "Metal Production",
        category: TECH_CATEGORIES.RESOURCE.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        tier: 1,
        description: "Increase the production rate of metal on all planets you control by 10% for each level.",
        effect: (level) => ({ metalProductionBonus: level * 0.1 }),
        prerequisites: []
    },
    CRYSTAL_PRODUCTION: {
        id: 2,
        name: "Crystal Production",
        category: TECH_CATEGORIES.RESOURCE.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        tier: 1,
        description: "Increase the output rate of crystal on all planets you control by 10% for each level.",
        effect: (level) => ({ crystalProductionBonus: level * 0.1 }),
        prerequisites: []
    },
    RESEARCH_PRODUCTION: {
        id: 3,
        name: "Research Efficiency",
        category: TECH_CATEGORIES.RESOURCE.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        tier: 1,
        description: "Increase the output rate of research on all planets you control by 10% for each level.",
        effect: (level) => ({ researchProductionBonus: level * 0.1 }),
        prerequisites: []
    },
    
    // Basic Combat Technologies
    WEAPONS_TECH: {
        id: 4,
        name: "Weapons Technology",
        category: TECH_CATEGORIES.MILITARY.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        tier: 1,
        description: "Increase the damage of all your ship weapons by 10% for each level. Orbital defense turrets do not gain this bonus.",
        effect: (level) => ({ weaponDamageBonus: level * 0.1 }),
        prerequisites: []
    },
    HULL_TECH: {
        id: 5,
        name: "Hull Technology",
        category: TECH_CATEGORIES.MILITARY.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        tier: 1,
        description: "Increase the damage absorption of all your ships by 10% for each level. Orbital turrets do not gain this bonus.",
        effect: (level) => ({ hullStrengthBonus: level * 0.1 }),
        prerequisites: []
    },
    SHIELD_TECH: {
        id: 6,
        name: "Shield Technology",
        category: TECH_CATEGORIES.MILITARY.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        tier: 1,
        description: "Each shield tech gained provides an additional 5% chance to completely deflect any hit. Base shields offer a 10% deflection chance.",
        effect: (level) => ({ shieldDeflectionBonus: level * 0.05 }),
        prerequisites: []
    },
    
    // Expansion Technologies
    TERRAFORMING: {
        id: 7,
        name: "Terraforming",
        category: TECH_CATEGORIES.EXPANSION.id,
        maxLevel: 8,
        baseCost: 100,
        costMultiplier: 8,
        tier: 1,
        description: "Each level allows you to colonize planets with higher terraforming requirements.",
        effect: (level) => ({ terraformingLevel: level }),
        prerequisites: []
    },
    
    // Intelligence Technologies
    PROBE_SENSORS: {
        id: 8,
        name: "Probe Sensors",
        category: TECH_CATEGORIES.INTEL.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        tier: 1,
        description: "Improves the information gathered by your probes when scanning enemy sectors.",
        effect: (level) => ({ probeSensorLevel: level }),
        prerequisites: []
    },
    WAVE_DAMPENING: {
        id: 9,
        name: "Wave Dampening",
        category: TECH_CATEGORIES.INTEL.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        tier: 1,
        description: "Reduces the effectiveness of enemy probe scans on your sectors.",
        effect: (level) => ({ waveDampeningLevel: level }),
        prerequisites: []
    },
    
    // Power Technologies
    NUCLEAR_FISSION: {
        id: 10,
        name: "Nuclear Fission",
        category: TECH_CATEGORIES.POWER.id,
        maxLevel: 1,
        baseCost: 200,
        tier: 2,
        description: "Foundation of nuclear power technology, enables basic atomic power generation.",
        effect: () => ({ unlocksFission: true }),
        prerequisites: []
    },
    NUCLEAR_FISSION_POWER_PLANTS: {
        id: 11,
        name: "Nuclear Fission Power Plants",
        category: TECH_CATEGORIES.POWER.id,
        maxLevel: 5,
        baseCost: 300,
        costMultiplier: 1.6,
        tier: 3,
        description: "Harnesses nuclear fission for efficient energy production, increasing resource output by 5% per level.",
        effect: (level) => ({ resourceBonus: level * 0.05 }),
        prerequisites: ["NUCLEAR_FISSION"]
    },
    NUCLEAR_FUSION: {
        id: 12,
        name: "Nuclear Fusion",
        category: TECH_CATEGORIES.POWER.id,
        maxLevel: 1,
        baseCost: 500,
        tier: 3,
        description: "Advanced power technology that combines atomic nuclei to release massive energy.",
        effect: () => ({ unlocksFusion: true }),
        prerequisites: ["NUCLEAR_FISSION"]
    },
    NUCLEAR_FUSION_POWER_PLANTS: {
        id: 13,
        name: "Nuclear Fusion Power Plants",
        category: TECH_CATEGORIES.POWER.id,
        maxLevel: 5,
        baseCost: 700,
        costMultiplier: 1.7,
        tier: 4,
        description: "Harnesses nuclear fusion for highly efficient energy production, increasing resource output by 10% per level.",
        effect: (level) => ({ resourceBonus: level * 0.1 }),
        prerequisites: ["THERMOSYSTIC_STEEL", "NUCLEAR_FISSION_POWER_PLANTS"]
    },
    COLD_FUSION: {
        id: 14,
        name: "Cold Fusion",
        category: TECH_CATEGORIES.POWER.id,
        maxLevel: 1,
        baseCost: 1200,
        tier: 5,
        description: "Revolutionary technology that enables fusion reactions at lower temperatures.",
        effect: () => ({ unlocksColdFusion: true }),
        prerequisites: ["NUCLEAR_FUSION_POWER_PLANTS", "ANTI_GRAVITRON_FIELD"]
    },
    COLD_FUSION_BATTERIES: {
        id: 15,
        name: "Cold Fusion Batteries",
        category: TECH_CATEGORIES.POWER.id,
        maxLevel: 3,
        baseCost: 1500,
        costMultiplier: 1.8,
        tier: 6,
        description: "Compact energy storage using cold fusion, significantly increases ship power efficiency by 15% per level.",
        effect: (level) => ({ shipPowerEfficiency: level * 0.15 }),
        prerequisites: ["COLD_FUSION"]
    },
    
    // Materials Technologies
    REACTIVE_ARMOR: {
        id: 16,
        name: "Reactive Armor",
        category: TECH_CATEGORIES.DEFENSE.id,
        maxLevel: 3,
        baseCost: 150,
        costMultiplier: 1.5,
        tier: 2,
        description: "Armor that reacts to incoming attacks, reducing damage by 8% per level.",
        effect: (level) => ({ damageReduction: level * 0.08 }),
        prerequisites: []
    },
    THERMOSYSTIC_STEEL: {
        id: 17,
        name: "Thermosystic Steel",
        category: TECH_CATEGORIES.DEFENSE.id,
        maxLevel: 1,
        baseCost: 800,
        tier: 4,
        description: "Advanced alloy that maintains integrity under extreme heat and pressure.",
        effect: () => ({ unlocksAdvancedMaterials: true }),
        prerequisites: ["NUCLEAR_FUSION", "NUCLEAR_FISSION_POWER_PLANTS"]
    },
    ENHANCED_ARMOR: {
        id: 18,
        name: "Enhanced Armor",
        category: TECH_CATEGORIES.DEFENSE.id,
        maxLevel: 5,
        baseCost: 900,
        costMultiplier: 1.5,
        tier: 5,
        description: "Superior armor plating that increases ship hull strength by 12% per level.",
        effect: (level) => ({ hullBonus: level * 0.12 }),
        prerequisites: ["THERMOSYSTIC_STEEL"]
    },
    ENHANCED_REACTIVE_ARMOR: {
        id: 19,
        name: "Enhanced Reactive Armor",
        category: TECH_CATEGORIES.DEFENSE.id,
        maxLevel: 3,
        baseCost: 1100,
        costMultiplier: 1.6,
        tier: 6,
        description: "Combines advanced materials with reactive technology, reducing damage by 15% per level.",
        effect: (level) => ({ damageReduction: level * 0.15 }),
        prerequisites: ["ENHANCED_ARMOR", "REACTIVE_ARMOR"]
    },
    ANTI_GRAVITRON_FIELD: {
        id: 20,
        name: "Anti-Gravitron Field",
        category: TECH_CATEGORIES.DEFENSE.id,
        maxLevel: 1,
        baseCost: 1000,
        tier: 5,
        description: "Creates a field that manipulates gravitational forces, enabling advanced propulsion and defensive systems.",
        effect: () => ({ unlocksAntiGrav: true }),
        prerequisites: ["THERMOSYSTIC_STEEL"]
    },
    MATTER_DEFLECTORS: {
        id: 21,
        name: "Matter Deflectors",
        category: TECH_CATEGORIES.DEFENSE.id,
        maxLevel: 5,
        baseCost: 1200,
        costMultiplier: 1.5,
        tier: 6,
        description: "Creates energy fields that deflect incoming matter, increasing shield effectiveness by 10% per level.",
        effect: (level) => ({ shieldEffectiveness: level * 0.1 }),
        prerequisites: ["ANTI_GRAVITRON_FIELD"]
    },
    
    // Weapon Technologies
    ATOMIC_WARHEAD_1: {
        id: 22,
        name: "Atomic Warhead I",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 400,
        tier: 3,
        description: "Basic nuclear weaponry that increases missile damage by 25%.",
        effect: () => ({ missileDamageBonus: 0.25 }),
        prerequisites: ["NUCLEAR_FISSION"]
    },
    ATOMIC_WARHEAD_2: {
        id: 23,
        name: "Atomic Warhead II",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 800,
        tier: 4,
        description: "Advanced nuclear weaponry that increases missile damage by 50%.",
        effect: () => ({ missileDamageBonus: 0.5 }),
        prerequisites: ["ATOMIC_WARHEAD_1", "NUCLEAR_FUSION"]
    },
    LASER_WEAPONS_1: {
        id: 24,
        name: "Laser Weapons I",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 500,
        tier: 4,
        description: "Basic laser weapon technology, increases energy weapon damage by 15%.",
        effect: () => ({ energyWeaponDamage: 0.15 }),
        prerequisites: ["NUCLEAR_FUSION_POWER_PLANTS"]
    },
    LASER_WEAPONS_2: {
        id: 25,
        name: "Laser Weapons II",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 800,
        tier: 5,
        description: "Improved laser technology, increases energy weapon damage by 30%.",
        effect: () => ({ energyWeaponDamage: 0.3 }),
        prerequisites: ["LASER_WEAPONS_1", "COLD_FUSION"]
    },
    LASER_WEAPONS_3: {
        id: 26,
        name: "Laser Weapons III",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 1200,
        tier: 6,
        description: "Advanced laser technology, increases energy weapon damage by 50%.",
        effect: () => ({ energyWeaponDamage: 0.5 }),
        prerequisites: ["LASER_WEAPONS_2", "COLD_FUSION_BATTERIES"]
    },
    LASER_WEAPONS_4: {
        id: 27,
        name: "Laser Weapons IV",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 1800,
        tier: 7,
        description: "Cutting-edge laser technology, increases energy weapon damage by 75%.",
        effect: () => ({ energyWeaponDamage: 0.75 }),
        prerequisites: ["LASER_WEAPONS_3"]
    },
    RAILGUN_1: {
        id: 28,
        name: "Railgun I",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 900,
        tier: 5,
        description: "Electromagnetic projectile launcher, increases kinetic weapon damage by 25%.",
        effect: () => ({ kineticWeaponDamage: 0.25 }),
        prerequisites: ["ANTI_GRAVITRON_FIELD"]
    },
    RAILGUN_2: {
        id: 29,
        name: "Railgun II",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 1400,
        tier: 6,
        description: "Advanced electromagnetic projectile launcher, increases kinetic weapon damage by 50%.",
        effect: () => ({ kineticWeaponDamage: 0.5 }),
        prerequisites: ["COLD_FUSION_BATTERIES"]
    },
    PLASMA_MANIPULATION: {
        id: 30,
        name: "Plasma Manipulation",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 1600,
        tier: 7,
        description: "Technology to control superheated plasma for weapons applications.",
        effect: () => ({ unlocksPlasmaWeapons: true }),
        prerequisites: ["MATTER_DEFLECTORS", "LASER_WEAPONS_3"]
    },
    PLASMA_CANNON: {
        id: 31,
        name: "Plasma Cannon",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 3,
        baseCost: 2000,
        costMultiplier: 1.6,
        tier: 8,
        description: "Devastating weapon that fires superheated plasma, dealing 25% more damage per level.",
        effect: (level) => ({ plasmaDamage: level * 0.25 }),
        prerequisites: ["PLASMA_MANIPULATION"]
    },
    ANTI_MATTER_MANIPULATION: {
        id: 32,
        name: "Anti-Matter Manipulation",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 2500,
        tier: 8,
        description: "Enables the safe handling of antimatter for both weapons and propulsion systems.",
        effect: () => ({ unlocksAntiMatter: true }),
        prerequisites: ["MATTER_DEFLECTORS"]
    },
    ANTI_MATTER_WARHEADS: {
        id: 33,
        name: "Anti-Matter Warheads",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 3,
        baseCost: 3000,
        costMultiplier: 1.8,
        tier: 9,
        description: "Devastating warheads that utilize matter-antimatter reactions, increases missile damage by 50% per level.",
        effect: (level) => ({ missileDamageBonus: level * 0.5 + 0.5 }),
        prerequisites: ["ANTI_MATTER_MANIPULATION"]
    },
    
    // Missile Technologies
    ROCKETRY_1: {
        id: 34,
        name: "Rocketry I",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 200,
        tier: 2,
        description: "Basic rocket propulsion for weapons systems.",
        effect: () => ({ unlocksMissiles: true }),
        prerequisites: []
    },
    ROCKETRY_2: {
        id: 35,
        name: "Rocketry II",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 300,
        tier: 3,
        description: "Improved rocket engines with 15% higher damage.",
        effect: () => ({ missileBaseDamage: 0.15 }),
        prerequisites: ["ROCKETRY_1"]
    },
    ROCKETRY_3: {
        id: 36,
        name: "Rocketry III",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 500,
        tier: 4,
        description: "Advanced rocket systems with 30% higher damage.",
        effect: () => ({ missileBaseDamage: 0.3 }),
        prerequisites: ["ROCKETRY_2"]
    },
    ROCKETRY_4: {
        id: 37,
        name: "Rocketry IV",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 800,
        tier: 5,
        description: "High-performance rockets with 50% higher damage.",
        effect: () => ({ missileBaseDamage: 0.5 }),
        prerequisites: ["ROCKETRY_3"]
    },
    ROCKETRY_5: {
        id: 38,
        name: "Rocketry V",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 1200,
        tier: 6,
        description: "State-of-the-art rocket technology with 75% higher damage.",
        effect: () => ({ missileBaseDamage: 0.75 }),
        prerequisites: ["ROCKETRY_4"]
    },
    SRM: {
        id: 39,
        name: "Short Range Missiles",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 3,
        baseCost: 250,
        costMultiplier: 1.4,
        tier: 2,
        description: "Short-range missile weapons, +10% damage per level.",
        effect: (level) => ({ shortRangeDamage: level * 0.1 }),
        prerequisites: ["ROCKETRY_1"]
    },
    LRM: {
        id: 40,
        name: "Long Range Missiles",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 3,
        baseCost: 400,
        costMultiplier: 1.5,
        tier: 3,
        description: "Long-range missile weapons, +15% damage per level.",
        effect: (level) => ({ longRangeDamage: level * 0.15 }),
        prerequisites: ["SRM", "ROCKETRY_2"]
    },
    HYPERV_MISSILES: {
        id: 41,
        name: "HyperV Missiles",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 3,
        baseCost: 700,
        costMultiplier: 1.6,
        tier: 4,
        description: "Advanced multi-stage missile system, +20% damage per level.",
        effect: (level) => ({ hyperVDamage: level * 0.2 }),
        prerequisites: ["LRM", "ROCKETRY_3"]
    },
    WRAITH_MISSILES: {
        id: 42,
        name: "Wraith Missiles",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 3,
        baseCost: 1500,
        costMultiplier: 1.7,
        tier: 7,
        description: "Stealthy missiles with phase-shifting technology, +25% damage per level.",
        effect: (level) => ({ wraithMissileDamage: level * 0.25 }),
        prerequisites: ["WARP_DRIVE_2", "ROCKETRY_4"]
    },
    PHOTON_TORPEDOES: {
        id: 43,
        name: "Photon Torpedoes",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 3,
        baseCost: 2000,
        costMultiplier: 1.8,
        tier: 8,
        description: "Devastating torpedoes using energy-to-matter conversion, +30% damage per level.",
        effect: (level) => ({ photonTorpedoDamage: level * 0.3 }),
        prerequisites: ["ROCKETRY_5", "WARP_DRIVE_2", "LASER_WEAPONS_4"]
    },
    NOVA_BOMB: {
        id: 44,
        name: "Nova Bomb",
        category: TECH_CATEGORIES.WEAPONS.id,
        maxLevel: 1,
        baseCost: 5000,
        tier: 10,
        description: "Planet-destroying superweapon that can only be used once per game.",
        effect: () => ({ unlocksNovaBomb: true }),
        prerequisites: ["TERRAFORM_5", "PHOTON_TORPEDOES"]
    },
    
    // Propulsion Technologies
    WARP_DRIVE_1: {
        id: 45,
        name: "Warp Drive I",
        category: TECH_CATEGORIES.PROPULSION.id,
        maxLevel: 1,
        baseCost: 1000,
        tier: 5,
        description: "Enables faster-than-light travel, reducing fleet movement cost by 20%.",
        effect: () => ({ movementCostReduction: 0.2 }),
        prerequisites: ["ANTI_GRAVITRON_FIELD", "ENHANCED_ARMOR", "ROCKETRY_3"]
    },
    WARP_DRIVE_2: {
        id: 46,
        name: "Warp Drive II",
        category: TECH_CATEGORIES.PROPULSION.id,
        maxLevel: 1,
        baseCost: 1800,
        tier: 6,
        description: "Advanced warp technology, reducing fleet movement cost by 40% total.",
        effect: () => ({ movementCostReduction: 0.4 }),
        prerequisites: ["MATTER_DEFLECTORS", "WARP_DRIVE_1"]
    },
    WORMHOLE_TRAVEL: {
        id: 47,
        name: "Wormhole Travel",
        category: TECH_CATEGORIES.PROPULSION.id,
        maxLevel: 1,
        baseCost: 3000,
        tier: 9,
        description: "Enables creation of stable wormholes for instantaneous travel between warp gates.",
        effect: () => ({ enablesWormholeTravel: true }),
        prerequisites: ["ANTI_MATTER_MANIPULATION"]
    },
    
    // Orbital Technologies
    ORBITAL_TECH_1: {
        id: 48,
        name: "Orbital Technology I",
        category: TECH_CATEGORIES.EXPANSION.id,
        maxLevel: 1,
        baseCost: 350,
        tier: 3,
        description: "Basic orbital construction techniques.",
        effect: () => ({ unlocksOrbitalTech: true }),
        prerequisites: ["ROCKETRY_2"]
    },
    ORBITAL_TECH_2: {
        id: 49,
        name: "Orbital Technology II",
        category: TECH_CATEGORIES.EXPANSION.id,
        maxLevel: 1,
        baseCost: 600,
        tier: 4,
        description: "Advanced orbital construction, enabling larger structures.",
        effect: () => ({ orbitalBuildCapacity: 0.5 }),
        prerequisites: ["ORBITAL_TECH_1", "ROCKETRY_3"]
    },
    SPACE_SHUTTLE: {
        id: 50,
        name: "Space Shuttle",
        category: TECH_CATEGORIES.SHIPS.id,
        maxLevel: 1,
        baseCost: 400,
        tier: 3,
        description: "Reusable spacecraft for transporting materials to orbit.",
        effect: () => ({ unlocksShipBuilding: true }),
        prerequisites: ["ORBITAL_TECH_1"]
    },
    SPACE_DOCK: {
        id: 51,
        name: "Space Dock",
        category: TECH_CATEGORIES.SHIPS.id,
        maxLevel: 3,
        baseCost: 700,
        costMultiplier: 1.5,
        tier: 4,
        description: "Orbital facility for constructing spacecraft, +20% build speed per level.",
        effect: (level) => ({ shipBuildSpeedBonus: level * 0.2 }),
        prerequisites: ["SPACE_SHUTTLE", "ORBITAL_TECH_2"]
    },
    ORBITAL_DEFENSE_1: {
        id: 52,
        name: "Orbital Defense I",
        category: TECH_CATEGORIES.DEFENSE.id,
        maxLevel: 3,
        baseCost: 500,
        costMultiplier: 1.5,
        tier: 3,
        description: "Basic orbital defense platforms, +15% orbital turret effectiveness per level.",
        effect: (level) => ({ orbitalDefenseBonus: level * 0.15 }),
        prerequisites: ["SPACE_SHUTTLE"]
    },
    ORBITAL_DEFENSE_2: {
        id: 53,
        name: "Orbital Defense II",
        category: TECH_CATEGORIES.DEFENSE.id,
        maxLevel: 3,
        baseCost: 900,
        costMultiplier: 1.6,
        tier: 4,
        description: "Advanced orbital defense grid, +25% orbital turret effectiveness per level.",
        effect: (level) => ({ orbitalDefenseBonus: level * 0.25 + 0.45 }),
        prerequisites: ["ORBITAL_DEFENSE_1", "SPACE_DOCK"]
    },
    
    // Ship Technologies
    COLONY_SHIP: {
        id: 54,
        name: "Colony Ship",
        category: TECH_CATEGORIES.SHIPS.id,
        maxLevel: 1,
        baseCost: 600,
        tier: 4,
        description: "Specialized vessel designed to establish colonies on new planets.",
        effect: () => ({ unlocksColonyShips: true }),
        prerequisites: ["SPACE_DOCK"]
    },
    DESTROYER: {
        id: 55,
        name: "Destroyer",
        category: TECH_CATEGORIES.SHIPS.id,
        maxLevel: 1,
        baseCost: 800,
        tier: 4,
        description: "Medium warship with balanced offensive and defensive capabilities.",
        effect: () => ({ unlocksDestroyers: true }),
        prerequisites: ["SPACE_DOCK"]
    },
    BATTLESHIP: {
        id: 56,
        name: "Battleship",
        category: TECH_CATEGORIES.SHIPS.id,
        maxLevel: 1,
        baseCost: 1200,
        tier: 5,
        description: "Heavy warship with superior firepower and durability.",
        effect: () => ({ unlocksBattleships: true }),
        prerequisites: ["DESTROYER"]
    },
    CARRIER: {
        id: 57,
        name: "Carrier",
        category: TECH_CATEGORIES.SHIPS.id,
        maxLevel: 1,
        baseCost: 1400,
        tier: 5,
        description: "Support vessel that can transport and deploy smaller craft.",
        effect: () => ({ unlocksCarriers: true }),
        prerequisites: ["DESTROYER"]
    },
    MOTHERSHIP: {
        id: 58,
        name: "Mothership",
        category: TECH_CATEGORIES.SHIPS.id,
        maxLevel: 1,
        baseCost: 2200,
        tier: 6,
        description: "Massive command vessel with exceptional capabilities in all areas.",
        effect: () => ({ unlocksMotherships: true }),
        prerequisites: ["CARRIER", "BATTLESHIP"]
    },
    INTERCEPTORS: {
        id: 59,
        name: "Interceptors",
        category: TECH_CATEGORIES.SHIPS.id,
        maxLevel: 3,
        baseCost: 900,
        costMultiplier: 1.5,
        tier: 5,
        description: "Small, fast attack craft carried by carriers, +20% damage per level.",
        effect: (level) => ({ interceptorDamage: level * 0.2 }),
        prerequisites: ["CARRIER"]
    },
    INTRUDERS: {
       id: 60,
       name: "Intruders",
       category: TECH_CATEGORIES.SHIPS.id,
       maxLevel: 3,
       baseCost: 1300,
       costMultiplier: 1.6,
       tier: 6,
       description: "Specialized craft designed to penetrate enemy defenses, +25% shield penetration per level.",
       effect: (level) => ({ shieldPenetration: level * 0.25 }),
       prerequisites: ["INTERCEPTORS"]
   },
   
   // Terraforming Technologies
   TERRAFORM_1: {
       id: 61,
       name: "Terraforming I",
       category: TECH_CATEGORIES.EXPANSION.id,
       maxLevel: 1,
       baseCost: 700,
       tier: 4,
       description: "Basic planetary environmental modification, allows colonization of tier 1 planets.",
       effect: () => ({ terraformLevel: 1 }),
       prerequisites: ["COLONY_SHIP"]
   },
   TERRAFORM_2: {
       id: 62,
       name: "Terraforming II",
       category: TECH_CATEGORIES.EXPANSION.id,
       maxLevel: 1,
       baseCost: 1000,
       tier: 5,
       description: "Improved terraforming technology, allows colonization of tier 2 planets.",
       effect: () => ({ terraformLevel: 2 }),
       prerequisites: ["TERRAFORM_1"]
   },
   TERRAFORM_3: {
       id: 63,
       name: "Terraforming III",
       category: TECH_CATEGORIES.EXPANSION.id,
       maxLevel: 1,
       baseCost: 1500,
       tier: 6,
       description: "Advanced terraforming capabilities, allows colonization of tier 3 planets.",
       effect: () => ({ terraformLevel: 3 }),
       prerequisites: ["TERRAFORM_2"]
   },
   TERRAFORM_4: {
       id: 64,
       name: "Terraforming IV",
       category: TECH_CATEGORIES.EXPANSION.id,
       maxLevel: 1,
       baseCost: 2200,
       tier: 7,
       description: "Superior terraforming methods, allows colonization of tier 4 planets.",
       effect: () => ({ terraformLevel: 4 }),
       prerequisites: ["TERRAFORM_3"]
   },
   TERRAFORM_5: {
       id: 65,
       name: "Terraforming V",
       category: TECH_CATEGORIES.EXPANSION.id,
       maxLevel: 1,
       baseCost: 3000,
       tier: 8,
       description: "Ultimate terraforming mastery, allows colonization of any habitable planet.",
       effect: () => ({ terraformLevel: 5 }),
       prerequisites: ["TERRAFORM_4"]
   }
};



/**
* Finds all prerequisites for a given technology
* @param {string} techKey - The key of the technology to find prerequisites for
* @return {Array} - Array of prerequisite technology keys
*/
function getPrerequisites(techKey) {
   const tech = TECHNOLOGIES[techKey];
   if (!tech || !tech.prerequisites || tech.prerequisites.length === 0) {
       return [];
   }
   return tech.prerequisites;
}

/**
* Calculate the cost of upgrading a technology
* @param {string} techKey - Technology key
* @param {number} currentLevel - Current technology level
* @return {number} - Cost in research points
*/
function calculateTechCost(techKey, currentLevel) {
   const tech = TECHNOLOGIES[techKey];
   if (!tech) return 0;
   
   // If tech has no cost multiplier, return base cost
   if (!tech.costMultiplier) {
       return tech.baseCost;
   }
   
   return Math.round(tech.baseCost * Math.pow(tech.costMultiplier, currentLevel));
}

/**
* Get the effect of a technology at a specific level
* @param {string} techKey - Technology key
* @param {number} level - Technology level
* @return {object} - Effect object with bonus values
*/
function getTechEffect(techKey, level) {
   const tech = TECHNOLOGIES[techKey];
   if (!tech || !tech.effect) return {};
   
   return tech.effect(level);
}

/**
* Check if a technology can be researched based on prerequisites and available research
* @param {string} techKey - Technology key
* @param {object} playerTechs - Player's current technology levels
* @param {number} availableResearch - Available research points
* @return {object} - Result object with success flag and message
*/
function canResearchTech(techKey, playerTechs, availableResearch) {
   const tech = TECHNOLOGIES[techKey];
   if (!tech) return { success: false, message: "Invalid technology." };
   
   const currentLevel = playerTechs[techKey] || 0;
   
   // Check if maximum level reached
   if (tech.maxLevel && currentLevel >= tech.maxLevel) {
       return { success: false, message: `You have reached the maximum level for ${tech.name}.` };
   }
   
   // Check prerequisites
   for (const prereqKey of tech.prerequisites) {
       const prereq = TECHNOLOGIES[prereqKey];
       if (!prereq) continue;
       
       const prereqLevel = playerTechs[prereqKey] || 0;
       if (prereqLevel === 0) {
           return { success: false, message: `You need to research ${prereq.name} first.` };
       }
   }
   
   // Calculate cost
   const cost = calculateTechCost(techKey, currentLevel);
   
   // Check if player has enough research
   if (availableResearch < cost) {
       return { success: false, message: `Not enough research. Need ${cost}.` };
   }
   
   return { success: true };
}

/**
* Gets all technologies available for research based on current tech levels
* @param {object} playerTechs - Player's current technology levels
* @return {Array} - Array of available technology keys
*/
function getAvailableTechnologies(playerTechs) {
   const available = [];
   
   for (const [techKey, tech] of Object.entries(TECHNOLOGIES)) {
       const currentLevel = playerTechs[techKey] || 0;
       
       // Skip if already at max level
       if (tech.maxLevel && currentLevel >= tech.maxLevel) {
           continue;
       }
       
       // Check prerequisites
       let prereqsMet = true;
       for (const prereqKey of tech.prerequisites) {
           const prereqLevel = playerTechs[prereqKey] || 0;
           if (prereqLevel === 0) {
               prereqsMet = false;
               break;
           }
       }
       
       if (prereqsMet) {
           available.push(techKey);
       }
   }
   
   return available;
}

/**
* Get technologies organized by tier
* @return {object} - Object with technologies grouped by tier
*/
function getTechByTier() {
   const tiers = {};
   
   for (const [techKey, tech] of Object.entries(TECHNOLOGIES)) {
       if (!tiers[tech.tier]) {
           tiers[tech.tier] = [];
       }
       
       tiers[tech.tier].push(techKey);
   }
   
   return tiers;
}

/**
* Get technologies organized by category
* @return {object} - Object with technologies grouped by category
*/
function getTechByCategory() {
   const categories = {};
   
   for (const [techKey, tech] of Object.entries(TECHNOLOGIES)) {
       if (!categories[tech.category]) {
           categories[tech.category] = [];
       }
       
       categories[tech.category].push(techKey);
   }
   
   return categories;
}

/**
* Generate a tech tree visualization data structure
* @return {object} - Data structure representing the tech tree
*/
function generateTechTree() {
   const tree = {
       nodes: [],
       links: []
   };
   
   // Add all technologies as nodes
   for (const [techKey, tech] of Object.entries(TECHNOLOGIES)) {
       tree.nodes.push({
           id: techKey,
           name: tech.name,
           tier: tech.tier,
           category: tech.category,
           maxLevel: tech.maxLevel,
           baseCost: tech.baseCost
       });
       
       // Add prerequisite links
       for (const prereqKey of tech.prerequisites) {
           tree.links.push({
               source: prereqKey,
               target: techKey
           });
       }
   }
   
   return tree;
}

/**
* Render a tech tree visualization using HTML/CSS
* @param {object} techs - Player's current tech levels
* @param {number} availableResearch - Available research points
* @param {HTMLElement} container - Container element to render into
*/
function renderTechUI(techs, availableResearch, container) {
   if (!container) return;
   
   // Clear container
   container.innerHTML = '';
   
   // Get technologies organized by tier
   const techByTier = getTechByTier();
   
   // Create container for each tier
   for (const [tier, techKeys] of Object.entries(techByTier).sort((a, b) => a[0] - b[0])) {
       const tierContainer = document.createElement('div');
       tierContainer.className = 'tech-tier';
       tierContainer.innerHTML = `<h3>Tier ${tier} Technologies</h3>`;
       
       const techGrid = document.createElement('div');
       techGrid.className = 'tech-grid';
       
       // Add tech buttons for this tier
       for (const techKey of techKeys) {
           const tech = TECHNOLOGIES[techKey];
           const currentLevel = techs[techKey] || 0;
           const cost = calculateTechCost(techKey, currentLevel);
           const canResearch = canResearchTech(techKey, techs, availableResearch).success;
           
           const techButton = document.createElement('div');
           techButton.className = `tech-button ${canResearch ? 'available' : 'unavailable'}`;
           techButton.setAttribute('data-tech', techKey);
           
           // Format maxLevel display
           let levelDisplay = '';
           if (tech.maxLevel > 1) {
               levelDisplay = ` (${currentLevel}/${tech.maxLevel})`;
           } else if (currentLevel > 0) {
               levelDisplay = ' (Researched)';
           }
           
           techButton.innerHTML = `
               <h4>${tech.name}${levelDisplay}</h4>
               <p>${tech.description}</p>
               <p class="tech-cost">Cost: ${cost} Research</p>
           `;
           
           // Add click handler
           techButton.addEventListener('click', function() {
               if (canResearch) {
                   if (confirm(`Research ${tech.name} for ${cost} research points?`)) {
                       // Send research request to server
                       websocket.send(`//buytech:${tech.id}`);
                   }
               } else {
                   // Show why research is unavailable
                   const result = canResearchTech(techKey, techs, availableResearch);
                   alert(result.message);
               }
           });
           
           // Add prerequisites as tooltip
           if (tech.prerequisites && tech.prerequisites.length > 0) {
               const prereqNames = tech.prerequisites.map(
                   prereqKey => TECHNOLOGIES[prereqKey]?.name || prereqKey
               ).join(', ');
               
               const tooltip = document.createElement('div');
               tooltip.className = 'tech-tooltip';
               tooltip.innerHTML = `<strong>Prerequisites:</strong> ${prereqNames}`;
               techButton.appendChild(tooltip);
           }
           
           techGrid.appendChild(techButton);
       }
       
       tierContainer.appendChild(techGrid);
       container.appendChild(tierContainer);
   }
}

// Export module functions and objects
module.exports = {
   TECH_CATEGORIES,
   TECHNOLOGIES,
   calculateTechCost,
   getTechEffect,
   canResearchTech,
   getAvailableTechnologies,
   getTechByTier,
   getTechByCategory,
   generateTechTree,
   renderTechUI
};