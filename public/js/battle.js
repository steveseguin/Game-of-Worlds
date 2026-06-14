/**
 * battle.js - Client-side battle visualization system
 * 
 * Handles the visual representation of space battles between fleets.
 * Creates and animates battle UI elements, ship movements and explosions.
 * 
 * This module is client-side only and does not directly access the database.
 * It's triggered by battle messages received from the server.
 * 
 * Dependencies:
 * - None, but is used by connect.js to visualize battle data
 */
const BattleSystem = (function() {
    // Array to store animation timers for cleanup
    let battleAnimationTimers = [];
    
    function createBattleVisualization(message, options = {}) {
        console.log("Creating battle visualization", message);
        
        // Clear any existing animation timers
        battleAnimationTimers.forEach(timer => clearTimeout(timer));
        battleAnimationTimers = [];
        
        // Parse battle data
        const parts = message.split(':');
        if (parts.length < 20) return;
        
        // Remove any existing battle ground
        const existingBattle = document.getElementById('battleGround');
        if (existingBattle) {
            document.body.removeChild(existingBattle);
        }
        const existingDim = document.getElementById('battleDim');
        if (existingDim) {
            document.body.removeChild(existingDim);
        }

        // Dim the game behind the theater — combat pauses the world.
        const dim = document.createElement('div');
        dim.id = 'battleDim';
        dim.style.cssText = 'position:fixed;inset:0;background:rgba(2,4,10,0.72);backdrop-filter:blur(3px);z-index:999;';
        document.body.appendChild(dim);

        // Create battle container
        const battleDiv = document.createElement('div');
        battleDiv.id = 'battleGround';
        battleDiv.style.position = 'fixed';
        battleDiv.style.left = '10%';
        battleDiv.style.width = '80%';
        battleDiv.style.height = '80%';
        battleDiv.style.top = '10%';
        battleDiv.style.background = '#000';
        battleDiv.style.backgroundImage = 'url(./images/spacebak.jpg)';
        battleDiv.style.backgroundSize = 'cover';
        battleDiv.style.zIndex = '1000';
        battleDiv.style.display = 'block';
        battleDiv.style.border = '1px solid rgba(120,170,255,0.35)';
        battleDiv.style.borderRadius = '14px';
        battleDiv.style.boxShadow = '0 22px 80px rgba(0,0,0,0.8)';
        battleDiv.style.overflow = 'hidden';
        document.body.appendChild(battleDiv);

        // Title banner
        const title = document.createElement('div');
        title.style.cssText = 'position:absolute;top:2%;left:50%;transform:translateX(-50%);color:#ffd166;font-weight:800;letter-spacing:3px;font-size:20px;text-transform:uppercase;text-shadow:0 2px 12px rgba(0,0,0,0.8);z-index:5;';
        title.textContent = options.sectorId ? `Battle for Sector ${options.sectorId}` : 'Fleet Engagement';
        battleDiv.appendChild(title);

        const completeBattle = () => {
            if (battleDiv.parentNode) {
                battleDiv.parentNode.removeChild(battleDiv);
            }
            const dimEl = document.getElementById('battleDim');
            if (dimEl && dimEl.parentNode) {
                dimEl.parentNode.removeChild(dimEl);
            }
            if (options.sectorId && window.GalaxyMap?.clearBattleSector) {
                window.GalaxyMap.clearBattleSector(options.sectorId);
            }
            if (window.GameScreen?.restoreTitle) {
                window.GameScreen.restoreTitle();
            }
            if (typeof options.onComplete === 'function') {
                options.onComplete();
            }
        };
        
        // Add skip button
        const skipButton = document.createElement('button');
        skipButton.id = 'stopBattle';
        skipButton.style.position = 'absolute';
        skipButton.style.right = '15%';
        skipButton.style.width = '5%';
        skipButton.style.height = '3%';
        skipButton.style.top = '10%';
        skipButton.innerHTML = 'SKIP';
        skipButton.onclick = completeBattle;
        battleDiv.appendChild(skipButton);
        
        // Side panels: who is fighting and how much of each fleet remains.
        const defenderHud = createSideHud(battleDiv, 'left', 'Defenders', '#7ec7ff');
        const attackerHud = createSideHud(battleDiv, 'right', 'Attackers', '#ff9d7e');

        const roundHud = document.createElement('div');
        roundHud.id = 'battleRoundHud';
        roundHud.style.cssText = 'position:absolute;top:8%;left:50%;transform:translateX(-50%);color:#cfd7ff;font-weight:700;letter-spacing:2px;font-size:14px;text-transform:uppercase;text-shadow:0 1px 8px rgba(0,0,0,0.8);z-index:5;';
        roundHud.textContent = 'Fleets engaging…';
        battleDiv.appendChild(roundHud);

        // Initial counts per type (attacker parts 1-9, defender parts 10-18).
        const initialAttackers = [];
        const initialDefenders = [];
        for (let shipType = 0; shipType < 9; shipType++) {
            initialAttackers.push(parseInt(parts[shipType + 1]) || 0);
            initialDefenders.push(parseInt(parts[shipType + 10]) || 0);
        }

        // Deterministic formations: one column per ship type, count labels
        // under each stack, so the battle reads as fleets instead of confetti.
        layoutFleet(battleDiv, 'attacker', initialAttackers);
        layoutFleet(battleDiv, 'defender', initialDefenders);
        updateSideHud(attackerHud, initialAttackers);
        updateSideHud(defenderHud, initialDefenders);
        
        // Add ground defenses if present
        const groundDefense = parseInt(parts[19]) || 0;
        if (groundDefense > 0) {
            const groundImg = document.createElement('img');
            groundImg.id = '1d09';
            groundImg.style.position = 'absolute';
            groundImg.style.left = '0%';
            groundImg.style.top = '10%';
            groundImg.style.height = '90%';
            groundImg.src = './images/ground.gif';
            battleDiv.appendChild(groundImg);
            
            const baseImg = document.createElement('img');
            baseImg.id = '1d010';
            baseImg.style.position = 'absolute';
            baseImg.style.left = '15%';
            baseImg.style.top = '60%';
            baseImg.src = './images/base.png';
            battleDiv.appendChild(baseImg);
        }
        
        // Animate battle with destruction sequence
        let round = 1;
        while ((round * 20 + 1) < parts.length && round < 10) {
            animateBattleRound(parts, round, battleDiv);
            round++;
        }
        const totalRounds = round - 1;

        // After the final round, declare the outcome on screen.
        const bannerTimer = setTimeout(() => {
            const base = totalRounds * 20;
            let attackersLeft = 0;
            let defendersLeft = 0;
            for (let i = 0; i < 9; i++) {
                attackersLeft += parseInt(parts[base + i + 1]) || 0;
                defendersLeft += parseInt(parts[base + i + 10]) || 0;
            }
            const banner = document.createElement('div');
            banner.style.cssText = 'position:absolute;top:42%;left:50%;transform:translateX(-50%) scale(0.6);color:#fff;font-weight:900;letter-spacing:6px;font-size:46px;text-transform:uppercase;text-shadow:0 0 24px rgba(255,140,60,0.9);z-index:6;transition:transform 0.4s ease, opacity 0.4s ease;opacity:0;';
            // Personal verdict for combatants; authoritative result otherwise.
            banner.textContent = options.viewerWon === true ? 'VICTORY'
                : options.viewerWon === false ? 'DEFEAT'
                : options.battleResult === 'att' ? 'Attackers Prevail'
                : options.battleResult === 'def' ? 'Defense Holds'
                : (attackersLeft > 0 && defendersLeft === 0 ? 'Attackers Prevail'
                    : (defendersLeft > 0 && attackersLeft === 0 ? 'Defense Holds' : 'Stalemate'));
            battleDiv.appendChild(banner);
            requestAnimationFrame(() => {
                banner.style.opacity = '1';
                banner.style.transform = 'translateX(-50%) scale(1)';
            });
            if (window.MediaManager?.playSfx) {
                window.MediaManager.playSfx('shipDestroyed');
            }
        }, totalRounds * ROUND_MS + 800);
        battleAnimationTimers.push(bannerTimer);

        // Automatically close shortly after the result lands.
        const closeTimer = setTimeout(() => {
            completeBattle();
        }, totalRounds * ROUND_MS + 5200);

        battleAnimationTimers.push(closeTimer);
    }
    
    const SHIP_NAMES = ['Frigate', 'Destroyer', 'Scout', 'Cruiser', 'Battleship', 'Colony', 'Dreadnought', 'Intruder', 'Carrier'];
    const VISIBLE_CAP = 8; // ships drawn per type; the count label carries the rest

    function createSideHud(container, side, title, color) {
        const hud = document.createElement('div');
        hud.id = side === 'left' ? 'battleHudDef' : 'battleHudAtt';
        hud.style.cssText = `position:absolute;top:7%;${side}:3%;min-width:130px;padding:8px 12px;`
            + 'background:rgba(8,12,24,0.78);border:1px solid rgba(255,255,255,0.14);border-radius:10px;'
            + `color:#e8ecff;font-size:13px;z-index:5;text-align:${side};`;
        hud.innerHTML = `<div style="font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${color};">${title}</div>`
            + '<div class="hud-count" style="font-size:18px;font-weight:800;"></div>'
            + '<div class="hud-bar" style="height:6px;margin-top:5px;border-radius:3px;background:rgba(255,255,255,0.15);overflow:hidden;">'
            + `<div class="hud-bar-fill" style="height:100%;width:100%;background:${color};transition:width 0.6s ease;"></div></div>`;
        container.appendChild(hud);
        return hud;
    }

    function updateSideHud(hud, counts) {
        if (!hud) return;
        const total = counts.reduce((sum, n) => sum + n, 0);
        if (hud.dataset.initial === undefined) {
            hud.dataset.initial = String(Math.max(1, total));
        }
        const countEl = hud.querySelector('.hud-count');
        if (countEl) countEl.textContent = `${total} ship${total === 1 ? '' : 's'}`;
        const fill = hud.querySelector('.hud-bar-fill');
        if (fill) fill.style.width = `${Math.max(0, Math.min(100, (total / Number(hud.dataset.initial)) * 100))}%`;
    }

    function layoutFleet(container, side, counts) {
        const prefix = side === 'attacker' ? '1a' : '1d';
        const presentTypes = [];
        counts.forEach((count, type) => { if (count > 0) presentTypes.push(type); });
        if (!presentTypes.length) return;

        presentTypes.forEach((type, columnIndex) => {
            const count = counts[type];
            // Columns fan out from each side's edge toward the middle.
            const columnOffset = 8 + columnIndex * Math.min(9, 26 / presentTypes.length);
            const left = side === 'attacker' ? (88 - columnOffset) : columnOffset;
            const visible = Math.min(count, VISIBLE_CAP);

            for (let i = 0; i < visible; i++) {
                const img = document.createElement('img');
                img.id = prefix + i + type;
                img.style.position = 'absolute';
                img.style.left = `${left + (i % 2 ? 2 : 0)}%`;
                img.style.top = `${22 + (i * 52) / Math.max(visible, 1)}%`;
                img.style.maxHeight = '9%';
                if (side === 'attacker') {
                    img.style.transform = 'scaleX(-1)';
                }
                img.src = './images/ship' + (type + 1) + '.gif';
                container.appendChild(img);
            }

            const label = document.createElement('div');
            label.id = `fleetlabel_${prefix}_${type}`;
            label.style.cssText = `position:absolute;left:${left - 2}%;top:80%;width:72px;text-align:center;`
                + 'color:#dce6ff;font-size:11px;font-weight:700;text-shadow:0 1px 6px rgba(0,0,0,0.9);z-index:5;';
            label.textContent = `${SHIP_NAMES[type]} ×${count}`;
            container.appendChild(label);
        });
    }

    function updateFleetLabels(container, battleData, round) {
        for (let i = 0; i < 18; i++) {
            const prefix = i < 9 ? '1a' : '1d';
            const type = i < 9 ? i : i - 9;
            const label = container.querySelector(`#fleetlabel_${prefix}_${type}`);
            if (!label) continue;
            const remaining = parseInt(battleData[i + 1 + round * 20]) || 0;
            label.textContent = `${SHIP_NAMES[type]} ×${remaining}`;
            label.style.opacity = remaining > 0 ? '1' : '0.35';
        }
    }

    function sideTotals(battleData, round) {
        const attackers = [];
        const defenders = [];
        for (let i = 0; i < 9; i++) {
            attackers.push(parseInt(battleData[i + 1 + round * 20]) || 0);
            defenders.push(parseInt(battleData[i + 10 + round * 20]) || 0);
        }
        return { attackers, defenders };
    }

    const ROUND_MS = 2600;

    function fireLaser(container, fromEl, toEl) {
        if (!fromEl || !toEl || !container) return;
        const cRect = container.getBoundingClientRect();
        const fRect = fromEl.getBoundingClientRect();
        const tRect = toEl.getBoundingClientRect();
        const x1 = fRect.left + fRect.width / 2 - cRect.left;
        const y1 = fRect.top + fRect.height / 2 - cRect.top;
        const x2 = tRect.left + tRect.width / 2 - cRect.left;
        const y2 = tRect.top + tRect.height / 2 - cRect.top;
        const length = Math.hypot(x2 - x1, y2 - y1);
        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

        const beam = document.createElement('div');
        beam.style.cssText = `position:absolute;left:${x1}px;top:${y1}px;width:${length}px;height:2px;` +
            'background:linear-gradient(90deg, rgba(120,220,255,0.1), rgba(140,230,255,0.95), rgba(255,90,90,0.9));' +
            `transform-origin:0 50%;transform:rotate(${angle}deg);z-index:4;pointer-events:none;box-shadow:0 0 8px rgba(120,220,255,0.8);`;
        container.appendChild(beam);
        const cleanup = setTimeout(() => {
            if (beam.parentNode) beam.parentNode.removeChild(beam);
        }, 260);
        battleAnimationTimers.push(cleanup);
    }

    function shipElements(container, side) {
        return Array.from(container.querySelectorAll('img'))
            .filter(el => el.id && el.id.startsWith(side === 'attacker' ? '1a' : '1d') && !el.dataset.dead);
    }

    function animateBattleRound(battleData, round, container) {
        const delay = ROUND_MS * round;

        const roundTimer = setTimeout(() => {
            // Update the scoreboard first so losses can be read against it.
            const roundHud = container.querySelector('#battleRoundHud');
            if (roundHud) roundHud.textContent = `Round ${round}`;
            const totals = sideTotals(battleData, round);
            updateSideHud(container.querySelector('#battleHudAtt'), totals.attackers);
            updateSideHud(container.querySelector('#battleHudDef'), totals.defenders);
            updateFleetLabels(container, battleData, round);

            // Exchange of fire: a volley of lasers between random living ships.
            const attackers = shipElements(container, 'attacker');
            const defenders = shipElements(container, 'defender');
            const volleys = Math.min(7, Math.max(3, Math.floor((attackers.length + defenders.length) / 3)));
            for (let v = 0; v < volleys; v++) {
                const beamTimer = setTimeout(() => {
                    const fromAtt = Math.random() > 0.5;
                    const src = fromAtt ? attackers : defenders;
                    const dst = fromAtt ? defenders : attackers;
                    if (src.length && dst.length) {
                        fireLaser(container,
                            src[Math.floor(Math.random() * src.length)],
                            dst[Math.floor(Math.random() * dst.length)]);
                    }
                }, Math.random() * 900);
                battleAnimationTimers.push(beamTimer);
            }
            if (window.MediaManager?.playSfx) {
                window.MediaManager.playSfx('laserFire');
            }

            // For each ship type (9 attacker types + 9 defender types)
            for (let i = 0; i < 18; i++) {
                const beforeCount = parseInt(battleData[i + 1 + (round - 1) * 20]) || parseInt(battleData[i + 1]) || 0;
                const afterCount = parseInt(battleData[i + 1 + round * 20]) || 0;

                // Animate destruction of lost ships
                for (let j = afterCount; j < beforeCount; j++) {
                    const prefix = i < 9 ? '1a' : '1d';
                    const shipType = i < 9 ? i : i - 9;
                    const shipId = prefix + j + shipType;

                    // Randomly time the explosions within the round
                    const explosionTimer = setTimeout(() => {
                        const ship = document.getElementById(shipId);
                        if (ship) {
                            ship.dataset.dead = '1';
                            ship.src = './images/boom.gif';
                            if (window.MediaManager?.playSfx) {
                                window.MediaManager.playSfx('explosion');
                            }

                            // Remove ship after explosion animation
                            const removeTimer = setTimeout(() => {
                                if (ship && ship.parentNode) {
                                    ship.parentNode.removeChild(ship);
                                }
                            }, 900);

                            battleAnimationTimers.push(removeTimer);
                        }
                    }, 600 + Math.random() * 1400);

                    battleAnimationTimers.push(explosionTimer);
                }
            }
        }, delay);

        battleAnimationTimers.push(roundTimer);
    }
    
    // Clean up all animation timers and elements
	function cleanupBattleVisualization() {
		// Clear all animation timers
		battleAnimationTimers.forEach(timer => clearTimeout(timer));
		battleAnimationTimers = [];
		
		// Remove battle DOM elements if they exist
		const battleGround = document.getElementById('battleGround');
		if (battleGround && battleGround.parentNode) {
			battleGround.parentNode.removeChild(battleGround);
		}
		const battleDim = document.getElementById('battleDim');
		if (battleDim && battleDim.parentNode) {
			battleDim.parentNode.removeChild(battleDim);
		}
	}
    
    return {
        createBattleVisualization,
        cleanupBattleVisualization
    };
})();

// Add cleanup on page hide/unload
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        BattleSystem.cleanupBattleVisualization();
    }
});

document.addEventListener('beforeunload', () => {
    BattleSystem.cleanupBattleVisualization();
});

window.BattleSystem = BattleSystem;
