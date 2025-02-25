// Technology Research System for Galaxy Conquest

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
    INTELLIGENCE: {
        id: 4,
        name: "Intelligence",
        description: "Technologies for gathering information about other players"
    }
};

/**
 * Technology definitions
 */
const TECHNOLOGIES = {
    METAL_PRODUCTION: {
        id: 1,
        name: "Metal Production",
        category: TECH_CATEGORIES.RESOURCE.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        description: "Increase the production rate of metal on all planets you control by 10% for each level.",
        effect: (level) => ({ metalProductionBonus: level * 0.1 })
    },
    CRYSTAL_PRODUCTION: {
        id: 2,
        name: "Crystal Production",
        category: TECH_CATEGORIES.RESOURCE.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        description: "Increase the output rate of crystal on all planets you control by 10% for each level.",
        effect: (level) => ({ crystalProductionBonus: level * 0.1 })
    },
    RESEARCH_PRODUCTION: {
        id: 3,
        name: "Research Efficiency",
        category: TECH_CATEGORIES.RESOURCE.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        description: "Increase the output rate of research on all planets you control by 10% for each level.",
        effect: (level) => ({ researchProductionBonus: level * 0.1 })
    },
    WEAPONS_TECH: {
        id: 4,
        name: "Weapons Technology",
        category: TECH_CATEGORIES.MILITARY.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        description: "Increase the damage of all your ship weapons by 10% for each level. Orbital defense turrets do not gain this bonus.",
        effect: (level) => ({ weaponDamageBonus: level * 0.1 })
    },
    HULL_TECH: {
        id: 5,
        name: "Hull Technology",
        category: TECH_CATEGORIES.MILITARY.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        description: "Increase the damage absorption of all your ships by 10% for each level. Orbital turrets do not gain this bonus.",
        effect: (level) => ({ hullStrengthBonus: level * 0.1 })
    },
    SHIELD_TECH: {
        id: 6,
        name: "Shield Technology",
        category: TECH_CATEGORIES.MILITARY.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        description: "Each shield tech gained provides an additional 5% chance to completely deflect any hit. Base shields offer a 10% deflection chance.",
        effect: (level) => ({ shieldDeflectionBonus: level * 0.05 })
    },
    TERRAFORMING: {
        id: 7,
        name: "Terraforming",
        category: TECH_CATEGORIES.EXPANSION.id,
        maxLevel: 8,
        baseCost: 100,
        costMultiplier: 8,
        description: "Each level allows you to colonize planets with higher terraforming requirements.",
        effect: (level) => ({ terraformingLevel: level })
    },
    PROBE_SENSORS: {
        id: 8,
        name: "Probe Sensors",
        category: TECH_CATEGORIES.INTELLIGENCE.id,
        maxLevel: 15,
        baseCost: 100,
        costMultiplier: 1.5,
        description: "Improves the information gathered by your probes when scanning enemy sectors.",
        effect: (level) => ({ probeSensorLevel: level })
    },