/**
 * tech.js - Technology tree (canonical definition, shared client/server)
 *
 * Branched, level-based tech tree in the spirit of the original 2012 tek.php:
 * colored playstyle branches, real numeric levels, cross-branch prerequisites,
 * and "requires"/"leads to" relationships.
 *
 * Player tech state is stored as "id:level,id:level" (legacy saves used a bare
 * comma list of ids, which parses as level 1 each).
 *
 * Effect slots aggregated across the tree:
 *   metal/crystal/research  - empire income multipliers
 *   weapons                 - +10% fleet damage per point (combat math)
 *   hull                    - +10% ship durability per point
 *   shields                 - shot deflection per point
 *   missiles                - bypasses enemy shields (0.5 shield pts per point)
 *   moveDiscount            - cheaper fleet movement (capped at 60%)
 *   shipyards               - unlocks heavier ship classes
 *   orbital                 - unlocks warp gates, +20% turret power per point
 *   terraform               - colonize planets with terraform requirement <= level
 *   spy / counterspy        - intel ladder (see who is winning the shadow war)
 *
 * IMPORTANT: server/lib/tech.js and public/js/tech.js are the same file.
 * Edit both together (tools/deploy.js ships both).
 */
const exportsTarget = typeof module !== 'undefined' && module.exports
    ? module.exports
    : (typeof window !== 'undefined'
        ? (window.TechSystem = window.TechSystem || {})
        : {});

const BRANCHES = {
    ECONOMY:    { key: 'ECONOMY',    name: 'Economy',      color: '#5dbb63', order: 1,  blurb: 'Raise empire-wide metal, crystal and research output.' },
    WEAPONS:    { key: 'WEAPONS',    name: 'Weapons',      color: '#e25555', order: 2,  blurb: 'Beam weaponry. Raises fleet damage.' },
    MISSILES:   { key: 'MISSILES',   name: 'Missiles',     color: '#f08c3a', order: 3,  blurb: 'Warheads that punch through enemy shields.' },
    ARMOR:      { key: 'ARMOR',      name: 'Armor',        color: '#d8a23c', order: 4,  blurb: 'Tougher hulls keep ships alive longer.' },
    SHIELDS:    { key: 'SHIELDS',    name: 'Shields',      color: '#4d79ff', order: 5,  blurb: 'Deflectors that make enemy shots miss.' },
    PROPULSION: { key: 'PROPULSION', name: 'Propulsion',   color: '#3fc1c9', order: 6,  blurb: 'Cheaper fleet movement across the map.' },
    SHIPS:      { key: 'SHIPS',      name: 'Shipyards',    color: '#9b6dd6', order: 7,  blurb: 'Unlock heavier ship classes.' },
    ORBITAL:    { key: 'ORBITAL',    name: 'Orbital',      color: '#e2d268', order: 8,  blurb: 'Fixed defenses and warp infrastructure.' },
    TERRAFORM:  { key: 'TERRAFORM',  name: 'Terraforming', color: '#2fbf9f', order: 9,  blurb: 'Colonize harsher, richer worlds.' },
    INTEL:      { key: 'INTEL',      name: 'Intel',        color: '#d65db1', order: 10, blurb: 'Spy on enemies - and blind their spies.' }
};

// requires: [{ tech: KEY, level: n }] - all must be met before level 1 can be bought.
const TECHNOLOGIES = {
    METAL_EXTRACTION: {
        id: 1, key: 'METAL_EXTRACTION', branch: 'ECONOMY', name: 'Metal Extraction',
        maxLevel: 10, baseCost: 80, costMultiplier: 1.45,
        effectPerLevel: { metal: 0.10 },
        summary: '+10% metal income per level.',
        requires: []
    },
    CRYSTAL_REFINING: {
        id: 2, key: 'CRYSTAL_REFINING', branch: 'ECONOMY', name: 'Crystal Refining',
        maxLevel: 10, baseCost: 80, costMultiplier: 1.45,
        effectPerLevel: { crystal: 0.10 },
        summary: '+10% crystal income per level. Crystal pays for probes, movement and spycraft.',
        requires: []
    },
    RESEARCH_NETWORKS: {
        id: 3, key: 'RESEARCH_NETWORKS', branch: 'ECONOMY', name: 'Research Networks',
        maxLevel: 10, baseCost: 90, costMultiplier: 1.45,
        effectPerLevel: { research: 0.10 },
        summary: '+10% research income per level.',
        requires: []
    },
    LASER_WEAPONS: {
        id: 4, key: 'LASER_WEAPONS', branch: 'WEAPONS', name: 'Laser Weapons',
        maxLevel: 5, baseCost: 90, costMultiplier: 1.6,
        effectPerLevel: { weapons: 1 },
        summary: '+10% fleet damage per level.',
        requires: []
    },
    PLASMA_CANNONS: {
        id: 10, key: 'PLASMA_CANNONS', branch: 'WEAPONS', name: 'Plasma Cannons',
        maxLevel: 5, baseCost: 260, costMultiplier: 1.6,
        effectPerLevel: { weapons: 1.5 },
        summary: '+15% fleet damage per level.',
        requires: [{ tech: 'LASER_WEAPONS', level: 3 }]
    },
    ANTIMATTER_WARHEADS: {
        id: 11, key: 'ANTIMATTER_WARHEADS', branch: 'WEAPONS', name: 'Antimatter Warheads',
        maxLevel: 3, baseCost: 700, costMultiplier: 1.7,
        effectPerLevel: { weapons: 2.5 },
        summary: '+25% fleet damage per level. The endgame gun.',
        requires: [{ tech: 'PLASMA_CANNONS', level: 3 }]
    },
    ROCKETRY: {
        id: 15, key: 'ROCKETRY', branch: 'MISSILES', name: 'Rocketry',
        maxLevel: 3, baseCost: 110, costMultiplier: 1.6,
        effectPerLevel: { missiles: 1 },
        summary: 'Each level partially bypasses enemy shields.',
        requires: []
    },
    HYPERV_MISSILES: {
        id: 16, key: 'HYPERV_MISSILES', branch: 'MISSILES', name: 'Hyper-V Missiles',
        maxLevel: 3, baseCost: 380, costMultiplier: 1.7,
        effectPerLevel: { missiles: 2 },
        summary: 'Heavy shield-piercing ordnance.',
        requires: [{ tech: 'ROCKETRY', level: 3 }, { tech: 'LASER_WEAPONS', level: 1 }]
    },
    REINFORCED_HULLS: {
        id: 5, key: 'REINFORCED_HULLS', branch: 'ARMOR', name: 'Reinforced Hulls',
        maxLevel: 5, baseCost: 90, costMultiplier: 1.6,
        effectPerLevel: { hull: 1 },
        summary: '+10% ship durability per level.',
        requires: []
    },
    REACTIVE_ARMOR: {
        id: 12, key: 'REACTIVE_ARMOR', branch: 'ARMOR', name: 'Reactive Armor',
        maxLevel: 5, baseCost: 260, costMultiplier: 1.6,
        effectPerLevel: { hull: 1.5 },
        summary: '+15% ship durability per level.',
        requires: [{ tech: 'REINFORCED_HULLS', level: 3 }]
    },
    ADAPTIVE_PLATING: {
        id: 13, key: 'ADAPTIVE_PLATING', branch: 'ARMOR', name: 'Adaptive Plating',
        maxLevel: 3, baseCost: 700, costMultiplier: 1.7,
        effectPerLevel: { hull: 2.5 },
        summary: '+25% ship durability per level.',
        requires: [{ tech: 'REACTIVE_ARMOR', level: 3 }, { tech: 'DEFLECTOR_SHIELDS', level: 2 }]
    },
    DEFLECTOR_SHIELDS: {
        id: 6, key: 'DEFLECTOR_SHIELDS', branch: 'SHIELDS', name: 'Deflector Shields',
        maxLevel: 5, baseCost: 100, costMultiplier: 1.6,
        effectPerLevel: { shields: 1 },
        summary: 'Enemy shots are more likely to miss, per level.',
        requires: []
    },
    PHASE_SHIELDS: {
        id: 14, key: 'PHASE_SHIELDS', branch: 'SHIELDS', name: 'Phase Shields',
        maxLevel: 4, baseCost: 320, costMultiplier: 1.7,
        effectPerLevel: { shields: 1.5 },
        summary: 'Advanced deflection. Stacks with deflector shields.',
        requires: [{ tech: 'DEFLECTOR_SHIELDS', level: 3 }]
    },
    ION_DRIVES: {
        id: 17, key: 'ION_DRIVES', branch: 'PROPULSION', name: 'Ion Drives',
        maxLevel: 5, baseCost: 100, costMultiplier: 1.5,
        effectPerLevel: { moveDiscount: 0.08 },
        summary: '-8% fleet movement cost per level.',
        requires: []
    },
    WARP_DRIVES: {
        id: 18, key: 'WARP_DRIVES', branch: 'PROPULSION', name: 'Warp Drives',
        maxLevel: 3, baseCost: 360, costMultiplier: 1.7,
        effectPerLevel: { moveDiscount: 0.08 },
        summary: 'Further -8% movement cost per level.',
        requires: [{ tech: 'ION_DRIVES', level: 3 }]
    },
    MILITARY_SHIPYARDS: {
        id: 19, key: 'MILITARY_SHIPYARDS', branch: 'SHIPS', name: 'Military Shipyards',
        maxLevel: 3, baseCost: 150, costMultiplier: 2.4,
        effectPerLevel: { shipyards: 1 },
        summary: 'Lv1: Destroyer + Cruiser. Lv2: Battleship + Intruder. Lv3: Dreadnought + Carrier.',
        requires: []
    },
    ORBITAL_ENGINEERING: {
        id: 20, key: 'ORBITAL_ENGINEERING', branch: 'ORBITAL', name: 'Orbital Engineering',
        maxLevel: 5, baseCost: 120, costMultiplier: 1.7,
        effectPerLevel: { orbital: 1 },
        summary: 'Lv1 unlocks Warp Gates. Orbital turrets +20% power per level.',
        requires: []
    },
    TERRAFORMING: {
        id: 7, key: 'TERRAFORMING', branch: 'TERRAFORM', name: 'Terraforming',
        maxLevel: 5, baseCost: 140, costMultiplier: 2.0,
        effectPerLevel: { terraform: 1 },
        summary: 'Colonize planets whose terraform requirement is at or below this level.',
        requires: []
    },
    ESPIONAGE: {
        id: 8, key: 'ESPIONAGE', branch: 'INTEL', name: 'Espionage Networks',
        maxLevel: 8, baseCost: 110, costMultiplier: 1.55,
        effectPerLevel: { spy: 1 },
        summary: 'Out-spy an empire to see their sectors, fleets, even their ledgers.',
        requires: []
    },
    COUNTER_INTEL: {
        id: 9, key: 'COUNTER_INTEL', branch: 'INTEL', name: 'Counter-Intelligence',
        maxLevel: 8, baseCost: 110, costMultiplier: 1.55,
        effectPerLevel: { counterspy: 1 },
        summary: 'Blind enemy probes and spies. Superior counter-intel destroys probes outright.',
        requires: []
    }
};

const TECH_BY_ID = {};
Object.values(TECHNOLOGIES).forEach(tech => { TECH_BY_ID[tech.id] = tech; });

// Which Military Shipyards level each ship class needs (ship type id -> level).
const SHIPYARD_REQUIREMENTS = {
    1: 0, // Frigate
    2: 1, // Destroyer
    3: 0, // Scout
    4: 1, // Cruiser
    5: 2, // Battleship
    6: 0, // Colony Ship
    7: 3, // Dreadnought
    8: 2, // Intruder
    9: 3  // Carrier
};

const MOVE_DISCOUNT_CAP = 0.6;

/** Parse "id:level,id:level" (or legacy "id,id") into { id: level }. */
function parseTechLevels(stored) {
    const levels = {};
    String(stored || '').split(',').forEach(entry => {
        const trimmed = entry.trim();
        if (!trimmed) return;
        const [idPart, levelPart] = trimmed.split(':');
        const id = Number.parseInt(idPart, 10);
        if (!Number.isFinite(id) || !TECH_BY_ID[id]) return;
        const level = levelPart === undefined ? 1 : Number.parseInt(levelPart, 10);
        if (!Number.isFinite(level) || level <= 0) return;
        levels[id] = Math.max(levels[id] || 0, Math.min(level, TECH_BY_ID[id].maxLevel));
    });
    return levels;
}

function serializeTechLevels(levels) {
    return Object.entries(levels || {})
        .filter(([id, level]) => TECH_BY_ID[id] && Number(level) > 0)
        .map(([id, level]) => `${id}:${level}`)
        .join(',');
}

function getLevel(levels, keyOrId) {
    const tech = typeof keyOrId === 'number' ? TECH_BY_ID[keyOrId] : TECHNOLOGIES[keyOrId];
    if (!tech) return 0;
    return Number(levels && levels[tech.id]) || 0;
}

/** Sum every tech's per-level effects into one flat profile. */
function aggregateEffects(levels) {
    const slots = {
        metal: 0, crystal: 0, research: 0,
        weapons: 0, hull: 0, shields: 0, missiles: 0,
        moveDiscount: 0, shipyards: 0, orbital: 0,
        terraform: 0, spy: 0, counterspy: 0
    };
    Object.values(TECHNOLOGIES).forEach(tech => {
        const level = getLevel(levels, tech.id);
        if (level <= 0) return;
        Object.entries(tech.effectPerLevel).forEach(([slot, amount]) => {
            slots[slot] += amount * level;
        });
    });
    slots.moveDiscount = Math.min(MOVE_DISCOUNT_CAP, slots.moveDiscount);
    return {
        ...slots,
        metalMult: 1 + slots.metal,
        crystalMult: 1 + slots.crystal,
        researchMult: 1 + slots.research
    };
}

function nextLevelCost(keyOrId, currentLevel) {
    const tech = typeof keyOrId === 'number' ? TECH_BY_ID[keyOrId] : TECHNOLOGIES[keyOrId];
    if (!tech) return Infinity;
    const level = Math.max(0, Number(currentLevel) || 0);
    if (level >= tech.maxLevel) return Infinity;
    return Math.round(tech.baseCost * Math.pow(tech.costMultiplier, level));
}

function requirementsMet(tech, levels) {
    return (tech.requires || []).every(req => {
        const reqTech = TECHNOLOGIES[req.tech];
        return reqTech && getLevel(levels, reqTech.id) >= req.level;
    });
}

function missingRequirements(tech, levels) {
    return (tech.requires || [])
        .filter(req => {
            const reqTech = TECHNOLOGIES[req.tech];
            return !reqTech || getLevel(levels, reqTech.id) < req.level;
        })
        .map(req => {
            const reqTech = TECHNOLOGIES[req.tech];
            return `${reqTech ? reqTech.name : req.tech} ${req.level}`;
        });
}

/** Can the next level of this tech be researched right now? */
function canResearch(keyOrId, levels, availableResearch) {
    const tech = typeof keyOrId === 'number' ? TECH_BY_ID[keyOrId] : TECHNOLOGIES[keyOrId];
    if (!tech) return { ok: false, reason: 'Unknown technology.' };
    const current = getLevel(levels, tech.id);
    if (current >= tech.maxLevel) return { ok: false, reason: `${tech.name} is already at maximum level.` };
    if (!requirementsMet(tech, levels)) {
        return { ok: false, reason: `Requires ${missingRequirements(tech, levels).join(', ')}.` };
    }
    const cost = nextLevelCost(tech.id, current);
    if (Number(availableResearch) < cost) {
        return { ok: false, reason: `Needs ${cost} research (you have ${Math.floor(Number(availableResearch) || 0)}).` };
    }
    return { ok: true, cost, nextLevel: current + 1 };
}

/** Techs that list this tech in their requirements ("leads to ..."). */
function leadsTo(keyOrId) {
    const tech = typeof keyOrId === 'number' ? TECH_BY_ID[keyOrId] : TECHNOLOGIES[keyOrId];
    if (!tech) return [];
    return Object.values(TECHNOLOGIES)
        .filter(other => (other.requires || []).some(req => req.tech === tech.key))
        .map(other => other.key);
}

function getTechnology(techId) {
    return TECH_BY_ID[Number(techId)] || null;
}

function listByBranch() {
    const byBranch = {};
    Object.values(BRANCHES)
        .sort((a, b) => a.order - b.order)
        .forEach(branch => { byBranch[branch.key] = []; });
    Object.values(TECHNOLOGIES).forEach(tech => {
        byBranch[tech.branch].push(tech);
    });
    Object.values(byBranch).forEach(list => list.sort((a, b) => a.baseCost - b.baseCost));
    return byBranch;
}

function shipyardLevelRequired(shipTypeId) {
    return SHIPYARD_REQUIREMENTS[Number(shipTypeId)] || 0;
}

Object.assign(exportsTarget, {
    BRANCHES,
    TECHNOLOGIES,
    TECH_BY_ID,
    SHIPYARD_REQUIREMENTS,
    MOVE_DISCOUNT_CAP,
    parseTechLevels,
    serializeTechLevels,
    getLevel,
    aggregateEffects,
    nextLevelCost,
    requirementsMet,
    missingRequirements,
    canResearch,
    leadsTo,
    getTechnology,
    listByBranch,
    shipyardLevelRequired
});
