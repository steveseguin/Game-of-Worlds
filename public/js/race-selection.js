/**
 * race-selection.js - Client-side race selection UI
 * 
 * Handles the race selection interface when joining a game,
 * showing unlocked races and their characteristics.
 */

const RaceSelection = (function() {
    let selectedRace = null;
    let unlockedRaces = [];
    let onSelectCallback = null;
    let detailPane = null;
    let confirmButton = null;
    let modalRef = null;
    let preferredRaceId = null;

    function ensureStyles() {
        if (document.getElementById('race-selection-styles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'race-selection-styles';
        style.textContent = `
            #raceSelectionModal {
                position: fixed;
                inset: 0;
                background: rgba(9, 12, 22, 0.88);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 2000;
                backdrop-filter: blur(4px);
                padding: 24px;
            }

            .race-selection-container {
                width: min(1080px, 100%);
                max-height: 90vh;
                background: #1c1f29;
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 14px;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
                display: grid;
                grid-template-columns: minmax(360px, 1fr) minmax(320px, 0.85fr);
                gap: 28px;
                padding: 28px;
                position: relative;
                color: #f5f7ff;
            }

            .race-selection-container h2 {
                grid-column: 1 / -1;
                text-align: center;
                margin: 0;
                font-size: 26px;
                letter-spacing: 1px;
                color: #ffd56c;
            }

            .race-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                gap: 16px;
                max-height: 60vh;
                overflow-y: auto;
                padding-right: 6px;
            }

            .race-card {
                border-radius: 12px;
                padding: 16px;
                background: linear-gradient(160deg, rgba(35, 39, 54, 0.95), rgba(26, 29, 42, 0.95));
                border: 1px solid rgba(255, 255, 255, 0.08);
                transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
                cursor: pointer;
                position: relative;
                min-height: 180px;
            }

            .race-card:hover {
                transform: translateY(-3px);
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
                border-color: rgba(102, 204, 255, 0.45);
            }

            .race-card.locked {
                cursor: not-allowed;
                opacity: 0.6;
            }

            .race-card.locked:hover {
                transform: none;
                box-shadow: none;
                border-color: rgba(255, 102, 102, 0.25);
            }

            .race-card.active {
                border-color: #38e0b8;
                box-shadow: 0 0 18px rgba(56, 224, 184, 0.45);
            }

            .race-card h3 {
                margin: 0 0 8px;
                font-size: 18px;
                letter-spacing: 0.5px;
            }

            .race-card p {
                font-size: 12px;
                line-height: 1.5;
                color: rgba(237, 240, 255, 0.7);
                margin: 0 0 12px;
            }

            .race-card .race-special {
                font-size: 12px;
                color: #f4c95d;
                margin-bottom: 12px;
            }

            .race-card .race-bonuses {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px 12px;
                font-size: 11px;
                color: rgba(237, 240, 255, 0.7);
            }

            .race-detail-panel {
                display: flex;
                flex-direction: column;
                gap: 18px;
                background: rgba(13, 16, 26, 0.55);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 12px;
                padding: 20px;
            }

            .race-detail-header h3 {
                margin: 0;
                font-size: 24px;
                letter-spacing: 0.8px;
            }

            .race-detail-description {
                font-size: 13px;
                line-height: 1.6;
                color: rgba(237, 240, 255, 0.82);
            }

            .race-detail-special {
                background: rgba(255, 213, 108, 0.12);
                border: 1px solid rgba(255, 213, 108, 0.35);
                border-radius: 10px;
                padding: 16px;
                font-size: 13px;
                color: #ffd56c;
                line-height: 1.6;
            }

            .race-detail-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 12px;
            }

            .race-detail-stat {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                padding: 12px;
                font-size: 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                color: rgba(237, 240, 255, 0.8);
            }

            .race-detail-stat strong {
                font-weight: 600;
                font-size: 13px;
            }

            .race-confirm-bar {
                margin-top: auto;
                display: flex;
                justify-content: flex-end;
            }

            .race-confirm-btn {
                padding: 12px 32px;
                background: linear-gradient(120deg, #3fe6c1, #26b6ff);
                border: none;
                border-radius: 999px;
                color: #060912;
                text-transform: uppercase;
                letter-spacing: 1px;
                font-weight: 700;
                cursor: pointer;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }

            .race-confirm-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 12px 25px rgba(63, 230, 193, 0.35);
            }

            .race-confirm-btn:disabled {
                cursor: not-allowed;
                opacity: 0.55;
                transform: none;
                box-shadow: none;
                background: rgba(114, 124, 138, 0.4);
                color: rgba(255, 255, 255, 0.6);
            }

            .race-locked-note {
                background: rgba(255, 105, 97, 0.12);
                border: 1px solid rgba(255, 105, 97, 0.4);
                border-radius: 10px;
                padding: 14px;
                font-size: 12px;
                color: #ff9a96;
                line-height: 1.5;
            }

            .race-purchase-btn {
                margin-top: 12px;
                padding: 10px 18px;
                border-radius: 999px;
                border: none;
                background: linear-gradient(120deg, #ffd56c, #ff9f43);
                color: #221613;
                font-weight: 700;
                cursor: pointer;
            }

            @media (max-width: 960px) {
                .race-selection-container {
                    grid-template-columns: 1fr;
                    max-height: 88vh;
                    overflow-y: auto;
                }

                .race-detail-panel {
                    position: sticky;
                    bottom: 0;
                    background: rgba(12, 15, 24, 0.92);
                    backdrop-filter: blur(6px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                }
            }

            @media (max-width: 640px) {
                #raceSelectionModal {
                    padding: 12px;
                }

                .race-selection-container {
                    padding: 16px;
                    gap: 16px;
                    border-radius: 12px;
                }

                .race-selection-container h2 {
                    font-size: 20px;
                }

                .race-grid {
                    grid-template-columns: 1fr;
                    max-height: 45vh;
                    gap: 12px;
                }

                .race-card {
                    padding: 14px;
                    min-height: 140px;
                }

                .race-card h3 {
                    font-size: 16px;
                }

                .race-card p {
                    font-size: 11px;
                }

                .race-card .race-special {
                    font-size: 11px;
                }

                .race-card .race-bonuses {
                    font-size: 10px;
                }

                .race-detail-panel {
                    padding: 14px;
                    gap: 12px;
                }

                .race-detail-header h3 {
                    font-size: 18px;
                }

                .race-detail-description {
                    font-size: 12px;
                }

                .race-detail-special {
                    padding: 12px;
                    font-size: 12px;
                }

                .race-detail-grid {
                    grid-template-columns: 1fr;
                    gap: 8px;
                }

                .race-detail-stat {
                    padding: 10px;
                    font-size: 11px;
                }

                .race-confirm-btn {
                    padding: 10px 24px;
                    font-size: 14px;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    function initialize(callback, activeRaceId) {
        onSelectCallback = callback;
        preferredRaceId = Number(activeRaceId) || null;
        loadUnlockedRaces();
    }
    
    function loadUnlockedRaces() {
        if (window.websocket && window.websocket.readyState === WebSocket.OPEN) {
            window.websocket.send('//getunlockedraces');
        }
    }
    
    function showRaceSelection(races) {
        unlockedRaces = Array.isArray(races) ? races : [];
        ensureStyles();

        const existing = document.getElementById('raceSelectionModal');
        if (existing) {
            existing.remove();
        }

        const modal = document.createElement('div');
        modal.id = 'raceSelectionModal';

        const container = document.createElement('div');
        container.className = 'race-selection-container';
        container.innerHTML = `
            <h2>Select Your Race</h2>
            <div class="race-grid">
                ${unlockedRaces.map(race => createRaceCard(race)).join('')}
            </div>
            <div class="race-detail-panel">
                <div class="race-detail-content"></div>
                <div class="race-confirm-bar">
                    <button class="race-confirm-btn" id="confirmRaceBtn">Confirm Selection</button>
                </div>
            </div>
        `;

        modal.appendChild(container);
        document.body.appendChild(modal);

        modalRef = modal;
        detailPane = container.querySelector('.race-detail-content');
        confirmButton = container.querySelector('#confirmRaceBtn');

        unlockedRaces.forEach(race => {
            const card = document.getElementById(`race-${race.id}`);
            if (card) {
                card.addEventListener('click', () => selectRace(race.id));
            }
        });

        confirmButton.addEventListener('click', confirmSelection);

        const preferred = preferredRaceId
            ? unlockedRaces.find(r => r.id === preferredRaceId && r.unlocked)
            : null;
        const firstUnlocked = preferred || unlockedRaces.find(r => r.unlocked) || unlockedRaces[0];
        if (firstUnlocked) {
            selectRace(firstUnlocked.id);
        } else {
            renderEmptyState();
        }
        preferredRaceId = null;
    }
    
    function createRaceCard(race) {
        const isLocked = !race.unlocked;
        const lockBadge = isLocked ? `<div style="position:absolute;top:10px;right:12px;font-size:18px;">🔒</div>` : '';
        return `
            <div id="race-${race.id}" class="race-card ${isLocked ? 'locked' : 'unlocked'}" data-race-id="${race.id}">
                ${lockBadge}
                <h3 style="color:${race.color || '#60d8ff'}">${race.name}</h3>
                <p>${race.description}</p>
                <div class="race-special"><strong>Signature:</strong> ${race.specialAbility}</div>
                <div class="race-bonuses">
                    <span>Metal: ${formatBonus(race.bonuses.metalProduction)}</span>
                    <span>Crystal: ${formatBonus(race.bonuses.crystalProduction)}</span>
                    <span>Research: ${formatBonus(race.bonuses.researchSpeed)}</span>
                    <span>Ship Cost: ${formatBonus(race.bonuses.shipCost)}</span>
                    <span>Attack: ${formatBonus(race.bonuses.shipAttack)}</span>
                    <span>Defense: ${formatBonus(race.bonuses.shipDefense)}</span>
                </div>
            </div>
        `;
    }
    
    function formatBonus(value) {
        if (typeof value !== 'number') {
            return `<span style="color:#9aa3b8">N/A</span>`;
        }
        const percent = Math.round((value - 1) * 100);
        const label = `${percent >= 0 ? '+' : ''}${percent}%`;
        const color = percent > 0 ? '#5df5b4' : percent < 0 ? '#ff8a80' : '#9aa3b8';
        return `<span style="color:${color};font-weight:600;">${label}</span>`;
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
        if (!race) {
            return;
        }

        selectedRace = race.unlocked ? raceId : null;

        document.querySelectorAll('.race-card').forEach(card => {
            card.classList.toggle('active', card.dataset.raceId === String(raceId) && race.unlocked);
        });

        renderRaceDetails(race);
    }

    function renderEmptyState() {
        if (!detailPane) {
            return;
        }
        detailPane.innerHTML = `
            <div style="text-align:center;color:rgba(237,240,255,0.65);font-size:14px;">
                No races available yet. Play or win games to unlock new factions!
            </div>
        `;
        if (confirmButton) {
            confirmButton.disabled = true;
        }
    }

    function renderRaceDetails(race) {
        if (!detailPane || !race) {
            return;
        }

        const locked = !race.unlocked;
        detailPane.innerHTML = `
            <div class="race-detail-header">
                <h3 style="color:${race.color || '#60d8ff'}">${race.name}</h3>
            </div>
            <div class="race-detail-description">${race.description}</div>
            <div class="race-detail-special">
                <strong>Signature Ability</strong><br>
                ${race.specialAbility}
            </div>
            <div class="race-detail-grid">
                <div class="race-detail-stat"><span>Metal Production</span><strong>${stripTags(formatBonus(race.bonuses.metalProduction))}</strong></div>
                <div class="race-detail-stat"><span>Crystal Production</span><strong>${stripTags(formatBonus(race.bonuses.crystalProduction))}</strong></div>
                <div class="race-detail-stat"><span>Research Speed</span><strong>${stripTags(formatBonus(race.bonuses.researchSpeed))}</strong></div>
                <div class="race-detail-stat"><span>Ship Cost</span><strong>${stripTags(formatBonus(race.bonuses.shipCost))}</strong></div>
                <div class="race-detail-stat"><span>Fleet Attack</span><strong>${stripTags(formatBonus(race.bonuses.shipAttack))}</strong></div>
                <div class="race-detail-stat"><span>Fleet Defense</span><strong>${stripTags(formatBonus(race.bonuses.shipDefense))}</strong></div>
            </div>
            ${locked ? `<div class="race-locked-note">${getUnlockText(race)}</div>` : ''}
        `;

        if (locked) {
            const btn = detailPane.querySelector('.race-purchase-btn');
            if (btn) {
                btn.addEventListener('click', () => purchaseRace(race.id));
            }
        }

        if (confirmButton) {
            confirmButton.disabled = locked;
        }
    }

    function stripTags(html) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }
    
    function confirmSelection() {
        if (!selectedRace) {
            return;
        }

        if (modalRef) {
            modalRef.remove();
            modalRef = null;
        }
        
        if (onSelectCallback) {
            onSelectCallback(selectedRace);
            onSelectCallback = null;
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
        if (typeof onSelectCallback !== 'function') {
            return;
        }
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
