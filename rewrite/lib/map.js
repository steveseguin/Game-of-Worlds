/**
 * lib/map.js - Server-side map generation and utilities
 * 
 * Implements map generation algorithms, sector types, and building types.
 * Provides functions for calculating resource production, movement costs,
 * and determining sector adjacency.
 * 
 * This module is server-side and has access to game state data.
 * It's a core game mechanic module used by the server.
 * 
 * Dependencies:
 * - Used by server.js and init.js for map operations
 */
/**
 * Sector types with their properties
 */
const SECTOR_TYPES = {
    EMPTY: {
        id: 0,
        name: "Empty Space",
        colonizable: false,
        description: "Empty space with no resources."
    },
    ASTEROID_BELT: {
        id: 1,
        name: "Asteroid Belt",
        colonizable: false,
        hazardous: true,
        description: "A dense asteroid belt that can damage ships passing through.",
        dangerLevel: 0.5 // Chance of ship loss when passing through
    },
    BLACK_HOLE: {
        id: 2,
        name: "Black Hole",
        colonizable: false,
        hazardous: true,
        description: "A black hole that destroys ships that come too close.",
        dangerLevel: 1.0 // Guaranteed ship loss
    },
    UNSTABLE_STAR: {
        id: 3,
        name: "Unstable Star",
        colonizable: false,
        description: "An unstable star that emits dangerous radiation."
    },
    BROWN_DWARF: {
        id: 4,
        name: "Brown Dwarf",
        colonizable: false,
        description: "A failed star with no planets."
    },
    SMALL_MOON: {
        id: 5,
        name: "Small Moon",
        colonizable: false,
        description: "A small moon without an atmosphere."
    },
    MICRO_PLANET: {
        id: 6,
        name: "Micro Planet",
        colonizable: true,
        maxBuildings: 4,
        description: "A tiny planet with limited building space.",
        resourceMultiplier: 0.8
    },
    SMALL_PLANET: {
        id: 7,
        name: "Small Planet",
        colonizable: true,
        maxBuildings: 6,
        description: "A small planet with moderate building space.",
        resourceMultiplier: 1.0
    },
    MEDIUM_PLANET: {
        id: 8,
        name: "Medium Planet",
        colonizable: true,
        maxBuildings: 8,
        description: "A medium-sized planet with good building space.",
        resourceMultiplier: 1.2
    },
    LARGE_PLANET: {
        id: 9,
        name: "Large Planet",
        colonizable: true,
        maxBuildings: 10,
        description: "A large planet with excellent building space.",
        resourceMultiplier: 1.5
    },
    HOMEWORLD: {
        id: 10,
        name: "Homeworld",
        colonizable: true,
        maxBuildings: 12,
        description: "A homeworld planet with maximum building space.",
        resourceMultiplier: 2.0
    }
};

/**
 * Building types with their properties
 */
const BUILDING_TYPES = {
    METAL_EXTRACTOR: {
        id: 1,
        name: "Metal Extractor",
        description: "Increases metal production by 100 per level",
        baseOutput: 100,
        baseCost: 100, // Base metal cost
        costMultiplier: 1.5 // Cost multiplier per level
    },
    CRYSTAL_REFINERY: {
        id: 2,
        name: "Crystal Refinery",
        description: "Increases crystal production by 100 per level",
        baseOutput: 100,
        baseCost: 100,
        costMultiplier: 1.5
    },
    RESEARCH_ACADEMY: {
        id: 3,
        name: "Research Academy",
        description: "Increases research output by 100 per level",
        baseOutput: 100,
        baseCost: 100,
        costMultiplier: 1.5
    },
    SPACEPORT: {
        id: 4,
        name: "Spaceport",
        description: "Provides build slots for ships",
        baseSlots: 1,
        baseCost: 100,
        costMultiplier: 1.5
    },
    ORBITAL_TURRET: {
        id: 5,
        name: "Orbital Turret",
        description: "Provides defense for the sector",
        baseCost: 300,
        costMultiplier: 1.5,
        attack: 2,
        hull: 2,
        shield: 1
    },
    WARP_GATE: {
        id: 6,
        name: "Warp Gate",
        description: "Allows instant travel to this sector from any location",
        baseCost: 2000,
        maxLevel: 1
    }
};

/**
 * Calculate the cost of upgrading a building
 * @param {number} buildingType - Building type ID
 * @param {number} currentLevel - Current building level
 * @return {number} - Cost in metal
 */
function calculateBuildingCost(buildingType, currentLevel) {
    const building = Object.values(BUILDING_TYPES).find(b => b.id === buildingType);
    if (!building) return 0;
    
    const nextLevel = currentLevel + 1;
    return Math.floor(building.baseCost * Math.pow(building.costMultiplier, currentLevel));
}

/**
 * Calculate resource production for a sector
 * @param {object} sector - Sector data from database
 * @param {object} techLevels - Player's tech levels
 * @return {object} - Resource production values
 */
function calculateResourceProduction(sector, techLevels) {
    // If sector isn't colonized, no production
    if (sector.colonized !== 1) {
        return { metal: 0, crystal: 0, research: 0 };
    }
    
    // Get sector type info
    const sectorType = Object.values(SECTOR_TYPES).find(type => type.id === sector.sectortype);
    if (!sectorType || !sectorType.colonizable) {
        return { metal: 0, crystal: 0, research: 0 };
    }
    
    // Calculate base production
    const metalProduction = (BUILDING_TYPES.METAL_EXTRACTOR.baseOutput * sector.metallvl) * 
                           (sector.metalbonus / 100) * 
                           sectorType.resourceMultiplier;
    
    const crystalProduction = (BUILDING_TYPES.CRYSTAL_REFINERY.baseOutput * sector.crystallvl) * 
                             (sector.crystalbonus / 100) * 
                             sectorType.resourceMultiplier;
    
    const researchProduction = (BUILDING_TYPES.RESEARCH_ACADEMY.baseOutput * sector.academylvl) * 
                              sectorType.resourceMultiplier;
    
    // Apply tech bonuses
    const metalWithTech = metalProduction * Math.pow(1.1, techLevels.tech1 || 0);
    const crystalWithTech = crystalProduction * Math.pow(1.1, techLevels.tech2 || 0);
    const researchWithTech = researchProduction * Math.pow(1.1, techLevels.tech3 || 0);
    
    return {
        metal: Math.floor(metalWithTech),
        crystal: Math.floor(crystalWithTech),
        research: Math.floor(researchWithTech)
    };
}

/**
 * Check if a building can be constructed on a sector
 * @param {number} buildingType - Building type ID
 * @param {object} sector - Sector data
 * @return {object} - Result with success flag and message
 */
function canConstructBuilding(buildingType, sector) {
    // If sector isn't colonized, no building
    if (sector.colonized !== 1) {
        return {
            success: false,
            message: "This sector is not colonized."
        };
    }
    
    // If there's terraforming needed, no building
    if (sector.terraformlvl > 0) {
        return {
            success: false,
            message: "This sector needs terraforming before construction."
        };
    }
    
    // Get sector type info
    const sectorType = Object.values(SECTOR_TYPES).find(type => type.id === sector.sectortype);
    if (!sectorType || !sectorType.colonizable) {
        return {
            success: false,
            message: "This sector cannot be built on."
        };
    }
    
    // Check building-specific restrictions
    const building = Object.values(BUILDING_TYPES).find(b => b.id === buildingType);
    if (!building) {
        return {
            success: false,
            message: "Invalid building type."
        };
    }
    
    // Check if we've reached max level for this building
    if (building.maxLevel && sector[getBuildingLevelField(buildingType)] >= building.maxLevel) {
        return {
            success: false,
            message: `${building.name} is already at maximum level.`
        };
    }
    
    // Check if planet has enough space for resource buildings
    if (buildingType <= 3) { // Resource buildings
        const currentLevel = sector[getBuildingLevelField(buildingType)];
        if (currentLevel + 1 > (sectorType.maxBuildings / 2)) {
            return {
                success: false,
                message: `You have reached the maximum level for ${building.name} on this planet.`
            };
        }
    }
    
    return { success: true };
}

/**
 * Get database field name for building level
 * @param {number} buildingType - Building type ID
 * @return {string} - Database field name
 */
function getBuildingLevelField(buildingType) {
    const fieldMap = {
        1: 'metallvl',
        2: 'crystallvl',
        3: 'academylvl',
        4: 'shipyardlvl',
        5: 'orbitalturret',
        6: 'warpgate'
    };
    return fieldMap[buildingType] || '';
}

/**
 * Check if a sector can be colonized
 * @param {object} sector - Sector data
 * @param {number} terraformLevel - Player's terraform tech level
 * @return {object} - Result with success flag and message
 */
function canColonizeSector(sector, terraformLevel) {
    // Check if sector already colonized
    if (sector.colonized === 1) {
        return {
            success: false,
            message: "This sector is already colonized."
        };
    }
    
    // Check if there's a planet to colonize
    const sectorType = Object.values(SECTOR_TYPES).find(type => type.id === sector.sectortype);
    if (!sectorType || !sectorType.colonizable) {
        return {
            success: false,
            message: "This sector has no colonizable planet."
        };
    }
    
    // Check if terraform level is sufficient
    if (terraformLevel < sector.terraformlvl) {
        return {
            success: false,
            message: `You need terraform level ${sector.terraformlvl} to colonize this planet.`
        };
    }
    
    // Check if there's a colony ship available
    if (sector.totalship6 <= 0) {
        return {
            success: false,
            message: "You need at least one colony ship in this sector to colonize."
        };
    }
    
    return { success: true };
}

/**
 * Generate a new game map
 * @param {number} width - Map width in sectors
 * @param {number} height - Map height in sectors
 * @param {number} playerCount - Number of players
 * @return {Array} - Map data
 */
function generateGameMap(width, height, playerCount) {
    const sectors = [];
    let sectorId = 1;
    
    // Create all sectors
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Determine sector type based on weighted probability
            let sectorType;
            const roll = Math.random();
            
            if (roll < 0.05) {
                // 5% chance of black hole
                sectorType = SECTOR_TYPES.BLACK_HOLE.id;
            } else if (roll < 0.15) {
                // 10% chance of asteroid belt
                sectorType = SECTOR_TYPES.ASTEROID_BELT.id;
            } else if (roll < 0.20) {
                // 5% chance of unstable star
                sectorType = SECTOR_TYPES.UNSTABLE_STAR.id;
            } else if (roll < 0.25) {
                // 5% chance of brown dwarf
                sectorType = SECTOR_TYPES.BROWN_DWARF.id;
            } else if (roll < 0.30) {
                // 5% chance of small moon
                sectorType = SECTOR_TYPES.SMALL_MOON.id;
            } else if (roll < 0.45) {
                // 15% chance of micro planet
                sectorType = SECTOR_TYPES.MICRO_PLANET.id;
            } else if (roll < 0.65) {
                // 20% chance of small planet
                sectorType = SECTOR_TYPES.SMALL_PLANET.id;
            } else if (roll < 0.80) {
                // 15% chance of medium planet
                sectorType = SECTOR_TYPES.MEDIUM_PLANET.id;
            } else if (roll < 0.90) {
                // 10% chance of large planet
                sectorType = SECTOR_TYPES.LARGE_PLANET.id;
            } else {
                // 10% chance of empty space
                sectorType = SECTOR_TYPES.EMPTY.id;
            }
            
            // Generate mineral and crystal bonuses
            const metalBonus = Math.floor(Math.random() * 200 + 50); // 50-250%
            const crystalBonus = Math.floor(Math.random() * 200 + 50); // 50-250%
            
            // Generate terraform level (0-5)
            let terraformLevel = 0;
            if (sectorType >= SECTOR_TYPES.MICRO_PLANET.id && sectorType <= SECTOR_TYPES.LARGE_PLANET.id) {
                terraformLevel = Math.floor(Math.random() * 6);
            }
            
            // Artifact chance (25% chance on planets)
            let artifact = 0;
            if (sectorType >= SECTOR_TYPES.MICRO_PLANET.id && Math.random() < 0.25) {
                artifact = Math.floor(Math.random() * 5) + 1;
            }
            
            // Create sector object
            const sector = {
                sectorid: sectorId++,
                sectortype: sectorType,
                ownerid: 0,
                colonized: 0,
                artifact: artifact,
                metalbonus: metalBonus,
                crystalbonus: crystalBonus,
                orbitalturret: 0,
                groundturret: 0,
                warpgate: 0,
                academylvl: 0,
                shipyardlvl: 0,
                metallvl: 0,
                crystallvl: 0,
                terraformlvl: terraformLevel,
                // Initialize all ship counters to 0
                totalship1: 0,
                totalship2: 0,
                totalship3: 0,
                totalship4: 0,
                totalship5: 0,
                totalship6: 0,
                totalship7: 0,
                totalship8: 0,
                totalship9: 0,
                totship1build: 0,
                totship2build: 0,
                totship3build: 0,
                totship4build: 0,
                totship5build: 0,
                totship6build: 0,
                totship7build: 0,
                totship8build: 0,
                totship9build: 0,
                totship1coming: 0,
                totship2coming: 0,
                totship3coming: 0,
                totship4coming: 0,
                totship5coming: 0,
                totship6coming: 0,
                totship7coming: 0,
                totship8coming: 0,
                totship9coming: 0
            };
            
            sectors.push(sector);
        }
    }
    
    // Place homeworlds for players
    const homeworlds = [];
    
    // Try to distribute homeworlds evenly across the map
    for (let i = 0; i < playerCount; i++) {
        let attempts = 0;
        let placed = false;
        
        while (!placed && attempts < 50) {
            // Calculate ideal positions in a circle
            const angle = (2 * Math.PI * i) / playerCount;
            const radius = Math.min(width, height) * 0.4;
            const centerX = width / 2;
            const centerY = height / 2;
            
            // Calculate target position with some randomness
            const targetX = Math.floor(centerX + Math.cos(angle) * radius + (Math.random() * 4 - 2));
            const targetY = Math.floor(centerY + Math.sin(angle) * radius + (Math.random() * 4 - 2));
            
            // Convert to sector index
            const targetIndex = targetY * width + targetX;
            
            // Make sure we're in bounds
            if (targetIndex >= 0 && targetIndex < sectors.length) {
                const sector = sectors[targetIndex];
                
                // Check if this location works for a homeworld
                if (sector.sectortype >= SECTOR_TYPES.MICRO_PLANET.id) {
                    // Convert to homeworld
                    sector.sectortype = SECTOR_TYPES.HOMEWORLD.id;
                    sector.terraformlvl = 0;
                    sector.metalbonus = 100;
                    sector.crystalbonus = 100;
                    
                    homeworlds.push(sector.sectorid);
                    placed = true;
                }
            }
            
            attempts++;
        }
        
        // If we couldn't place a homeworld, use any planet
        if (!placed) {
            // Find an unused planet
            for (const sector of sectors) {
                if (
                    sector.sectortype >= SECTOR_TYPES.MICRO_PLANET.id && 
                    sector.sectortype < SECTOR_TYPES.HOMEWORLD.id &&
                    !homeworlds.includes(sector.sectorid)
                ) {
                    sector.sectortype = SECTOR_TYPES.HOMEWORLD.id;
                    sector.terraformlvl = 0;
                    sector.metalbonus = 100;
                    sector.crystalbonus = 100;
                    
                    homeworlds.push(sector.sectorid);
                    break;
                }
            }
        }
    }
    
    return { sectors, homeworlds };
}

/**
 * Check if two sectors are adjacent
 * @param {number} sector1 - First sector ID
 * @param {number} sector2 - Second sector ID
 * @param {number} mapWidth - Width of the map in sectors
 * @return {boolean} - Whether the sectors are adjacent
 */
function areSectorsAdjacent(sector1, sector2, mapWidth) {
    // Convert to 0-based indices
    const s1 = sector1 - 1;
    const s2 = sector2 - 1;
    
    // Calculate row and column for both sectors
    const row1 = Math.floor(s1 / mapWidth);
    const col1 = s1 % mapWidth;
    const row2 = Math.floor(s2 / mapWidth);
    const col2 = s2 % mapWidth;
    
    // Check if they're adjacent (considering even-odd row offsets for hexagonal grid)
    if (row1 === row2) {
        // Same row - adjacent if columns differ by 1
        return Math.abs(col1 - col2) === 1;
    } 
    
    if (Math.abs(row1 - row2) === 1) {
        if (row1 % 2 === 0) {
            // Even row
            return col2 === col1 || col2 === col1 - 1;
        } else {
            // Odd row
            return col2 === col1 || col2 === col1 + 1;
        }
    }
    
    return false;
}

/**
 * Get adjacent sectors
 * @param {number} sectorId - Sector ID
 * @param {number} mapWidth - Width of the map in sectors
 * @param {number} mapHeight - Height of the map in sectors
 * @return {Array} - Array of adjacent sector IDs
 */
function getAdjacentSectors(sectorId, mapWidth, mapHeight) {
    const adjacent = [];
    const s = sectorId - 1; // Convert to 0-based index
    
    // Calculate row and column
    const row = Math.floor(s / mapWidth);
    const col = s % mapWidth;
    
    // Check if row is even or odd (affects adjacency in hexagonal grid)
    const isEvenRow = row % 2 === 0;
    
    // Check sector to the right
    if (col < mapWidth - 1) {
        adjacent.push(s + 1 + 1); // +1 to convert back to 1-based
    }
    
    // Check sector to the left
    if (col > 0) {
        adjacent.push(s - 1 + 1);
    }
    
    // Check sectors in the row above
    if (row > 0) {
        if (isEvenRow) {
            // Even row - top-left and top
            adjacent.push(s - mapWidth + 1);
            
            if (col > 0) {
                adjacent.push(s - mapWidth - 1 + 1);
            }
        } else {
            // Odd row - top and top-right
            adjacent.push(s - mapWidth + 1);
            
            if (col < mapWidth - 1) {
                adjacent.push(s - mapWidth + 1 + 1);
            }
        }
    }
    
    // Check sectors in the row below
    if (row < mapHeight - 1) {
        if (isEvenRow) {
            // Even row - bottom-left and bottom
            adjacent.push(s + mapWidth + 1);
            
            if (col > 0) {
                adjacent.push(s + mapWidth - 1 + 1);
            }
        } else {
            // Odd row - bottom and bottom-right
            adjacent.push(s + mapWidth + 1);
            
            if (col < mapWidth - 1) {
                adjacent.push(s + mapWidth + 1 + 1);
            }
        }
    }
    
    return adjacent;
}

/**
 * Calculate crystal cost for fleet movement
 * @param {object} fleet - Fleet composition
 * @return {number} - Total crystal cost
 */
function calculateMovementCost(fleet) {
    let totalCost = 0;
    
    // Sum costs for each ship type
    Object.entries(SHIP_TYPES).forEach(([_, shipType]) => {
        const count = fleet[`ship${shipType.id}`] || 0;
        if (count > 0) {
            totalCost += count * shipType.movementCost;
        }
    });
    
    return totalCost;
}

/**
 * Handle hazardous sector effects
 * @param {object} fleet - Fleet composition
 * @param {object} sector - Sector data
 * @return {object} - Updated fleet after hazards
 */
function applyHazardEffects(fleet, sector) {
    const updatedFleet = { ...fleet };
    
    // Only apply effects for hazardous sectors
    const sectorType = Object.values(SECTOR_TYPES).find(type => type.id === sector.sectortype);
    if (!sectorType || !sectorType.hazardous) {
        return updatedFleet;
    }
    
    // Apply random losses based on danger level
    Object.entries(SHIP_TYPES).forEach(([_, shipType]) => {
        const key = `ship${shipType.id}`;
        const count = updatedFleet[key] || 0;
        
        if (count > 0) {
            // Calculate survivors
            const survivorRate = 1 - sectorType.dangerLevel;
            const survivors = Math.round(count * survivorRate * Math.random());
            updatedFleet[key] = survivors;
        }
    });
    
    return updatedFleet;
}

// Export functions for use in server.js
module.exports = {
    SECTOR_TYPES,
    BUILDING_TYPES,
    calculateBuildingCost,
    calculateResourceProduction,
    canConstructBuilding,
    formatSectorMessage,
    formatBuildingMessage,
    formatFleetMessage,
    canColonizeSector,
    generateGameMap,
    areSectorsAdjacent,
    getAdjacentSectors,
    calculateMovementCost,
    applyHazardEffects
};