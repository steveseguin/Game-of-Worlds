/**
 * lib/tech.js - Technology system implementation
 * 
 * Defines the technology tree, tech requirements, costs, and effects.
 * Provides functions for researching technologies and calculating
 * tech-related bonuses. Includes comprehensive tech tree definition.
 * 
 * This module can be used both client-side (for UI) and server-side (for mechanics).
 * The server-side version has database access, while client-side is for UI display.
 * 
 * Dependencies:
 * - Used by server.js for tech mechanics on the server
 * - May be used by client for tech tree visualization
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
 * Get technology by ID
 * @param {number} techId - Technology ID number
 * @return {object|null} - Technology object or null if not found
 */
function getTechnology(techId) {
    // Find technology by matching ID
    for (const [techKey, tech] of Object.entries(TECHNOLOGIES)) {
        if (tech.id === techId) {
            return {
                key: techKey,
                ...tech
            };
        }
    }
    return null;
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
   getTechnology,
   renderTechUI
};