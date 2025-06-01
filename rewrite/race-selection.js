/**
 * race-selection.js - Client-side race selection UI
 * 
 * Handles the race selection interface when joining a game,
 * showing unlocked races and their characteristics.
 */

const RaceSelection = (function() {
    let selectedRace = 1; // Default to Terran
    let unlockedRaces = [];
    let onSelectCallback = null;
    
    function initialize(callback) {
        onSelectCallback = callback;
        loadUnlockedRaces();
    }
    
    function loadUnlockedRaces() {
        // Request unlocked races from server
        if (window.websocket && window.websocket.readyState === WebSocket.OPEN) {
            window.websocket.send('//getunlockedraces');
        }
    }
    
    function showRaceSelection(races) {
        unlockedRaces = races;
        
        // Create race selection modal
        const modal = document.createElement('div');
        modal.id = 'raceSelectionModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
        `;
        
        const container = document.createElement('div');
        container.style.cssText = `
            background: #222;
            border: 2px solid #444;
            border-radius: 10px;
            padding: 20px;
            max-width: 900px;
            max-height: 80vh;
            overflow-y: auto;
            color: white;
        `;
        
        container.innerHTML = `
            <h2 style="text-align: center; color: #FFC040; margin-bottom: 20px;">Select Your Race</h2>
            <div id="raceGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px;">
                ${races.map(race => createRaceCard(race)).join('')}
            </div>
            <div style="text-align: center; margin-top: 20px;">
                <button id="confirmRaceBtn" style="
                    padding: 10px 30px;
                    background: #40C0A0;
                    border: none;
                    color: white;
                    font-weight: bold;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 16px;
                ">Confirm Selection</button>
            </div>
        `;
        
        modal.appendChild(container);
        document.body.appendChild(modal);
        
        // Add event listeners
        races.forEach(race => {
            const card = document.getElementById(`race-${race.id}`);
            if (card) {
                card.addEventListener('click', () => selectRace(race.id));
            }
        });
        
        document.getElementById('confirmRaceBtn').addEventListener('click', confirmSelection);
        
        // Select first race by default
        selectRace(races[0].id);
    }
    
    function createRaceCard(race) {
        const isLocked = !race.unlocked;
        const statusClass = isLocked ? 'locked' : 'unlocked';
        
        return `
            <div id="race-${race.id}" class="race-card ${statusClass}" style="
                border: 2px solid ${isLocked ? '#666' : '#444'};
                border-radius: 8px;
                padding: 15px;
                cursor: ${isLocked ? 'not-allowed' : 'pointer'};
                opacity: ${isLocked ? '0.6' : '1'};
                background: ${isLocked ? '#333' : '#2a2a2a'};
                position: relative;
                transition: all 0.2s;
            ">
                ${isLocked ? `<div style="position: absolute; top: 10px; right: 10px; color: #ff6666;">🔒</div>` : ''}
                <h3 style="color: ${race.color || '#40C0FF'}; margin-bottom: 10px;">${race.name}</h3>
                <p style="font-size: 12px; color: #aaa; margin-bottom: 10px;">${race.description}</p>
                
                <div style="font-size: 11px; margin-bottom: 8px;">
                    <strong style="color: #FFC040;">Special:</strong> ${race.specialAbility}
                </div>
                
                <div style="font-size: 10px; color: #888;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
                        <span>Metal: ${formatBonus(race.bonuses.metalProduction)}</span>
                        <span>Crystal: ${formatBonus(race.bonuses.crystalProduction)}</span>
                        <span>Research: ${formatBonus(race.bonuses.researchSpeed)}</span>
                        <span>Ship Cost: ${formatBonus(race.bonuses.shipCost)}</span>
                        <span>Attack: ${formatBonus(race.bonuses.shipAttack)}</span>
                        <span>Defense: ${formatBonus(race.bonuses.shipDefense)}</span>
                    </div>
                </div>
                
                ${isLocked ? `
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #444; font-size: 11px; color: #ff9999;">
                        ${getUnlockText(race)}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    function formatBonus(value) {
        const percent = Math.round((value - 1) * 100);
        const color = percent > 0 ? '#4CAF50' : percent < 0 ? '#f44336' : '#aaa';
        return `<span style="color: ${color}">${percent >= 0 ? '+' : ''}${percent}%</span>`;
    }
    
    function getUnlockText(race) {
        switch (race.unlockType) {
            case 'achievement':
                const req = race.unlockRequirement;
                switch (req.type) {
                    case 'wins': return `Win ${req.count} games`;
                    case 'games_played': return `Play ${req.count} games`;
                    case 'planets_colonized': return `Colonize ${req.count} planets total`;
                    case 'total_crystal': return `Earn ${req.count} crystal total`;
                    case 'ships_built': return `Build ${req.count} ships total`;
                    case 'battles_won': return `Win ${req.count} battles`;
                    case 'sectors_explored': return `Explore ${req.count} sectors`;
                    default: return 'Complete achievement';
                }
            case 'referral':
                return `Refer ${race.unlockRequirement.count} friends`;
            case 'premium':
                return `<button onclick="RaceSelection.purchaseRace(${race.id})" style="
                    padding: 5px 10px;
                    background: #FFD700;
                    color: #000;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: bold;
                ">Unlock for $${race.unlockRequirement.amount}</button>`;
            default:
                return 'Locked';
        }
    }
    
    function selectRace(raceId) {
        const race = unlockedRaces.find(r => r.id === raceId);
        if (!race || !race.unlocked) return;
        
        // Update visual selection
        document.querySelectorAll('.race-card').forEach(card => {
            card.style.borderColor = '#444';
            card.style.boxShadow = 'none';
        });
        
        const selectedCard = document.getElementById(`race-${raceId}`);
        if (selectedCard) {
            selectedCard.style.borderColor = '#40C0A0';
            selectedCard.style.boxShadow = '0 0 10px rgba(64, 192, 160, 0.5)';
        }
        
        selectedRace = raceId;
    }
    
    function confirmSelection() {
        const modal = document.getElementById('raceSelectionModal');
        if (modal) {
            modal.remove();
        }
        
        if (onSelectCallback) {
            onSelectCallback(selectedRace);
        }
    }
    
    function purchaseRace(raceId) {
        // Initialize Stripe checkout for premium race
        const race = unlockedRaces.find(r => r.id === raceId);
        if (!race || race.unlockType !== 'premium') return;
        
        // This would integrate with Stripe
        // For now, show a placeholder
        alert(`Premium race purchase would open Stripe checkout for $${race.unlockRequirement.amount}`);
        
        // In production:
        // window.location.href = `/purchase-race?race=${raceId}`;
    }
    
    // Handle server response with unlocked races
    function handleUnlockedRaces(data) {
        try {
            const races = JSON.parse(data);
            showRaceSelection(races);
        } catch (e) {
            console.error('Error parsing race data:', e);
        }
    }
    
    return {
        initialize,
        handleUnlockedRaces,
        purchaseRace
    };
})();

// Make purchaseRace globally accessible for onclick
window.RaceSelection = RaceSelection;