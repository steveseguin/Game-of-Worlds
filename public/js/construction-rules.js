// Construction rules shared by the command console, game engine, and integrity checks.
const ConstructionRules = (() => {
    const BUILDING_COSTS = {
        0: { name: "Metal Extractor", metal: 50, crystal: 20 },
        1: { name: "Crystal Refinery", metal: 40, crystal: 30 },
        2: { name: "Research Academy", metal: 60, crystal: 40 },
        3: { name: "Spaceport", metal: 100, crystal: 50 },
        4: { name: "Orbital Turret", metal: 80, crystal: 60 },
        5: { name: "Warp Gate", metal: 200, crystal: 150 }
    };

    const BUILDING_SLOTS_BY_TYPE = Object.freeze({ 1: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: 6 });

    const SPACEPORT_TIERS = Object.freeze({
        1: Object.freeze({ capacity: 12, research: 0 }),
        2: Object.freeze({ capacity: 20, research: 1, metal: 350, crystal: 100 }),
        3: Object.freeze({ capacity: 32, research: 2, metal: 800, crystal: 250 }),
        4: Object.freeze({ capacity: 48, research: 3, metal: 1600, crystal: 500 })
    });

    return { BUILDING_COSTS, BUILDING_SLOTS_BY_TYPE, SPACEPORT_TIERS };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ConstructionRules;
} else if (typeof window !== 'undefined') {
    window.ConstructionRules = ConstructionRules;
}
