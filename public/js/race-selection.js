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

            .race-detail-doctrine {
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 10px;
                padding: 14px 16px;
                font-size: 12px;
                line-height: 1.65;
                color: rgba(237, 240, 255, 0.85);
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .race-detail-doctrine strong {
                display: block;
                margin-bottom: 4px;
                color: #ffd56c;
                letter-spacing: 0.4px;
            }

            .race-card .race-doctrine {
                margin-top: 10px;
                font-size: 10.5px;
                line-height: 1.4;
                color: rgba(255, 160, 150, 0.85);
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
            <header class="race-selector-header">
                <div>
                    <div class="race-selector-eyebrow">Faction database // command authorization</div>
                    <h2>Select Your Race</h2>
                    <p>Choose an empire doctrine. Strengths are powerful; restrictions are permanent for this match.</p>
                </div>
                <div class="race-selector-count"><strong>${unlockedRaces.filter(race => race.unlocked).length}</strong><span>available</span></div>
            </header>
            <div class="race-selection-main">
                <section class="race-grid-shell" aria-label="Race roster">
                    <div class="race-grid-heading">
                        <span>Faction roster</span>
                        <small>Select a dossier to inspect</small>
                    </div>
                    <div class="race-grid">
                        ${unlockedRaces.map(race => createRaceCard(race)).join('')}
                    </div>
                </section>
                <aside class="race-detail-panel" aria-live="polite">
                    <div class="race-detail-content"></div>
                    <div class="race-confirm-bar">
                        <div class="race-confirm-note"><span></span> Selection locks when you confirm</div>
                        <button class="race-confirm-btn" id="confirmRaceBtn">Confirm Selection</button>
                    </div>
                </aside>
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
        return `
            <button type="button" id="race-${race.id}" class="race-card ${isLocked ? 'locked' : 'unlocked'}" data-race-id="${race.id}" aria-pressed="false">
                <span class="race-card-header">
                    <img src="${raceIcon(race.id)}" alt="" aria-hidden="true">
                    <span class="race-card-title">
                        <span class="race-card-index">Faction ${String(race.id).padStart(2, '0')}</span>
                        <h3 style="color:${race.color || '#60d8ff'}">${race.name}</h3>
                    </span>
                    <span class="race-card-status ${isLocked ? 'is-locked' : 'is-ready'}">${isLocked ? 'Locked' : 'Ready'}</span>
                </span>
                <p>${race.description}</p>
                <span class="race-special"><strong>Signature</strong>${race.specialAbility}</span>
                <span class="race-doctrine">${compactDoctrine(race)}</span>
            </button>
        `;
    }

    function raceIcon(raceId) {
        const icons = {
            1: 'terran-icon.svg', 2: 'silicon-icon.svg', 3: 'zephyr-icon.svg',
            4: 'crystalline-icon.svg', 5: 'void-icon.svg', 6: 'mechanicus-icon.svg',
            7: 'bioform-icon.svg', 8: 'nomad-icon.svg', 9: 'ancient-icon.svg',
            10: 'quantum-icon.svg', 11: 'titan-icon.svg', 12: 'shadow-icon.svg'
        };
        return `images/${icons[Number(raceId)] || 'terran-icon.svg'}`;
    }

    // One-line trade-off hint for the race grid card.
    function compactDoctrine(race) {
        const d = race.doctrine || {};
        const parts = [];
        if (Array.isArray(d.lockedBranches) && d.lockedBranches.length) parts.push(`No ${d.lockedBranches.join('/')}`);
        if (Array.isArray(d.lockedShips) && d.lockedShips.length) parts.push(`No ${d.lockedShips.join('/')}`);
        if (!parts.length && Array.isArray(d.cappedBranches) && d.cappedBranches.length) {
            parts.push(`Capped: ${d.cappedBranches.length} branch${d.cappedBranches.length > 1 ? 'es' : ''}`);
        }
        return parts.length ? parts.join(' · ') : 'Full tech &amp; all hulls';
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
    
    // Tech-tree + ship-hull doctrine: what the race trades away for its strengths.
    function renderDoctrine(race) {
        const d = race.doctrine || {};
        const rows = [];
        if (Array.isArray(d.cappedBranches) && d.cappedBranches.length) {
            rows.push(`<div><span style="color:#ffcf6c;">Limited tech:</span> ${d.cappedBranches.join(', ')}</div>`);
        }
        if (Array.isArray(d.lockedBranches) && d.lockedBranches.length) {
            rows.push(`<div><span style="color:#ff8a80;">Locked tech:</span> ${d.lockedBranches.join(', ')}</div>`);
        }
        if (Array.isArray(d.lockedShips) && d.lockedShips.length) {
            rows.push(`<div><span style="color:#ff8a80;">Can't build:</span> ${d.lockedShips.join(', ')}</div>`);
        }
        if (!rows.length) {
            rows.push(`<div style="color:#5df5b4;">Full tech tree and every ship hull.</div>`);
        }
        return `<div class="race-detail-doctrine"><strong>Doctrine &amp; Restrictions</strong>${rows.join('')}</div>`;
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
                return `<button class="race-purchase-btn" onclick="RaceSelection.purchaseRace(${race.id})" style="
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
            const active = card.dataset.raceId === String(raceId) && race.unlocked;
            card.classList.toggle('active', active);
            card.setAttribute('aria-pressed', active ? 'true' : 'false');
        });

        const container = modalRef?.querySelector('.race-selection-container');
        if (container) {
            container.style.setProperty('--race-accent', race.color || '#60d8ff');
        }

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
                <img src="${raceIcon(race.id)}" alt="" aria-hidden="true">
                <div>
                    <span class="race-detail-kicker">Selected dossier // ${locked ? 'restricted' : 'command ready'}</span>
                    <h3 style="color:${race.color || '#60d8ff'}">${race.name}</h3>
                </div>
            </div>
            <div class="race-detail-description">${race.description}</div>
            <div class="race-detail-special">
                <strong>Signature Ability</strong>
                <span>${race.specialAbility}</span>
            </div>
            <div class="race-detail-grid">
                ${detailStat('Metal Production', race.bonuses.metalProduction)}
                ${detailStat('Crystal Production', race.bonuses.crystalProduction)}
                ${detailStat('Research Speed', race.bonuses.researchSpeed)}
                ${detailStat('Ship Cost', race.bonuses.shipCost, true)}
                ${detailStat('Fleet Attack', race.bonuses.shipAttack)}
                ${detailStat('Fleet Defense', race.bonuses.shipDefense)}
            </div>
            ${renderDoctrine(race)}
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

    function detailStat(label, value, inverse = false) {
        const percent = typeof value === 'number' ? Math.round((value - 1) * 100) : null;
        const positive = percent === null ? false : inverse ? percent < 0 : percent > 0;
        const negative = percent === null ? false : inverse ? percent > 0 : percent < 0;
        const tone = positive ? 'positive' : negative ? 'negative' : 'neutral';
        return `<div class="race-detail-stat" data-tone="${tone}"><span>${label}</span><strong>${stripTags(formatBonus(value))}</strong></div>`;
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
        const race = unlockedRaces.find(r => r.id === raceId);
        if (!race || race.unlockType !== 'premium') return;

        window.location.href = `/purchase-race.html?race=${encodeURIComponent(raceId)}`;
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
