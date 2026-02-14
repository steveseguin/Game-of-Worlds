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

    function parseFleetTotal(parts, startIndex) {
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(parts[startIndex + i], 10) || 0;
        }
        return sum;
    }
    
    function createBattleVisualization(message) {
        console.log("Creating battle visualization", message);
        
        // Clear any existing animation timers
        battleAnimationTimers.forEach(timer => clearTimeout(timer));
        battleAnimationTimers = [];
        
        // Parse battle data
        const parts = message.split(':');
        if (parts.length < 20) return;

        const attackerInitial = parseFleetTotal(parts, 1);
        const defenderInitial = parseFleetTotal(parts, 10) + (parseInt(parts[19], 10) || 0) + (parseInt(parts[20], 10) || 0);
        const hasFinalState = parts.length >= 40;
        const attackerFinal = hasFinalState ? parseFleetTotal(parts, 21) : attackerInitial;
        const defenderFinal = hasFinalState
            ? parseFleetTotal(parts, 30) + (parseInt(parts[39], 10) || 0) + (parseInt(parts[40], 10) || 0)
            : defenderInitial;
        
        // Remove any existing battle ground
        const existingBattle = document.getElementById('battleGround');
        if (existingBattle) {
            document.body.removeChild(existingBattle);
        }
        
        // Create battle container
        const battleDiv = document.createElement('div');
        battleDiv.id = 'battleGround';
        battleDiv.style.position = 'absolute';
        battleDiv.style.left = '10%';
        battleDiv.style.width = '80%';
        battleDiv.style.height = '80%';
        battleDiv.style.top = '10%';
        battleDiv.style.background = '#000';
        battleDiv.style.backgroundImage = 'url(./images/spacebak.jpg)';
        battleDiv.style.zIndex = '1000';
        battleDiv.style.display = 'block';
        battleDiv.style.border = '1px solid rgba(130, 170, 255, 0.4)';
        battleDiv.style.borderRadius = '10px';
        battleDiv.style.overflow = 'hidden';
        document.body.appendChild(battleDiv);

        const hud = document.createElement('div');
        hud.id = 'battleHud';
        hud.style.position = 'absolute';
        hud.style.left = '2%';
        hud.style.right = '2%';
        hud.style.top = '2%';
        hud.style.minHeight = '54px';
        hud.style.padding = '8px 12px';
        hud.style.background = 'rgba(6, 11, 26, 0.72)';
        hud.style.border = '1px solid rgba(130, 170, 255, 0.35)';
        hud.style.borderRadius = '8px';
        hud.style.color = '#dce7ff';
        hud.style.display = 'flex';
        hud.style.alignItems = 'center';
        hud.style.justifyContent = 'space-between';
        hud.style.fontSize = '13px';
        hud.innerHTML = `
            <div id="battleHudAttackers"><b>Attackers</b>: ${attackerInitial} engaged</div>
            <div id="battleRoundIndicator"><b>Engagement</b>: live</div>
            <div id="battleHudDefenders"><b>Defenders</b>: ${defenderInitial} engaged</div>
        `;
        battleDiv.appendChild(hud);
        
        // Add skip button
        const skipButton = document.createElement('button');
        skipButton.id = 'stopBattle';
        skipButton.style.position = 'absolute';
        skipButton.style.right = '2%';
        skipButton.style.width = '80px';
        skipButton.style.height = '34px';
        skipButton.style.top = '2%';
        skipButton.style.borderRadius = '6px';
        skipButton.style.background = '#1d3559';
        skipButton.style.color = '#dce7ff';
        skipButton.style.border = '1px solid rgba(130, 170, 255, 0.55)';
        skipButton.innerHTML = 'SKIP';
        skipButton.onclick = () => {
            document.body.removeChild(battleDiv);
        };
        battleDiv.appendChild(skipButton);
        
        // Add headers
        const attackerHeader = document.createElement('h1');
        attackerHeader.id = 'atttxt';
        attackerHeader.style.position = 'absolute';
        attackerHeader.style.right = '12%';
        attackerHeader.style.top = '14%';
        attackerHeader.innerHTML = 'Attackers';
        battleDiv.appendChild(attackerHeader);
        
        const defenderHeader = document.createElement('h1');
        defenderHeader.id = 'deftxt';
        defenderHeader.style.position = 'absolute';
        defenderHeader.style.right = '80%';
        defenderHeader.style.top = '14%';
        defenderHeader.innerHTML = 'Defenders';
        battleDiv.appendChild(defenderHeader);
        
        // Create ships for attackers (index 1-9)
        for (let shipType = 0; shipType < 9; shipType++) {
            const shipCount = parseInt(parts[shipType + 1]) || 0;
            for (let i = 0; i < shipCount; i++) {
                createShipImage(battleDiv, '1a' + i + shipType, 'right', shipType + 1);
            }
        }
        
        // Create ships for defenders (index 10-18)
        for (let shipType = 0; shipType < 9; shipType++) {
            const shipCount = parseInt(parts[shipType + 10]) || 0;
            for (let i = 0; i < shipCount; i++) {
                createShipImage(battleDiv, '1d' + i + shipType, 'left', shipType + 1);
            }
        }
        
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

        const summaryTimer = setTimeout(() => {
            const attackerHud = document.getElementById('battleHudAttackers');
            const defenderHud = document.getElementById('battleHudDefenders');
            const roundHud = document.getElementById('battleRoundIndicator');
            if (attackerHud) {
                attackerHud.innerHTML = `<b>Attackers</b>: ${attackerInitial} -> ${attackerFinal}`;
            }
            if (defenderHud) {
                defenderHud.innerHTML = `<b>Defenders</b>: ${defenderInitial} -> ${defenderFinal}`;
            }
            if (roundHud) {
                roundHud.innerHTML = `<b>Engagement</b>: resolved`;
            }
        }, 4200);
        battleAnimationTimers.push(summaryTimer);
        
        // Automatically close after a short post-resolution window
        const closeTimer = setTimeout(() => {
            if (document.getElementById('battleGround')) {
                document.body.removeChild(document.getElementById('battleGround'));
            }
        }, 15000);
        
        battleAnimationTimers.push(closeTimer);
    }
    
    function createShipImage(container, id, side, shipType) {
        const img = document.createElement('img');
        img.id = id;
        img.style.position = 'absolute';
        
        if (side === 'right') {
            img.style.left = Math.round(Math.random() * 20 + 60) + '%';
            img.style.transform = 'scaleX(-1)';
            img.style.webkitTransform = 'scaleX(-1)';
        } else {
            img.style.left = Math.round(Math.random() * 20 + 20) + '%';
        }
        
        img.style.top = Math.round(Math.random() * 60 + 20) + '%';
        img.src = './images/ship' + shipType + '.gif';
        container.appendChild(img);
    }
    
    function animateBattleRound(battleData, round, container) {
        const delay = 3200 * round;
        
        const roundTimer = setTimeout(() => {
            const roundHud = document.getElementById('battleRoundIndicator');
            if (roundHud) {
                roundHud.innerHTML = `<b>Engagement</b>: exchange ${round}`;
            }

            // For each ship type (9 attacker types + 9 defender types)
            for (let i = 0; i < 18; i++) {
                const beforeCount = parseInt(battleData[i + 1]) || 0;
                const afterCount = parseInt(battleData[i + 1 + round * 20]) || 0;
                
                // Calculate losses
                const losses = beforeCount - afterCount;
                
                // Animate destruction of lost ships
                for (let j = afterCount; j < beforeCount; j++) {
                    const prefix = i < 9 ? '1a' : '1d';
                    const shipType = i < 9 ? i : i - 9;
                    const shipId = prefix + j + shipType;
                    
                    // Randomly time the explosions
                    const explosionTimer = setTimeout(() => {
                        const ship = document.getElementById(shipId);
                        if (ship) {
                            ship.src = './images/boom.gif';
                            
                            // Add explosion sound if available
                            try {
                                const sound = new Audio('explosion.mp3');
                                sound.volume = 0.3;
                                sound.play().catch(e => console.log('Sound play error:', e));
                            } catch (e) {
                                console.log('Sound play error:', e);
                            }
                            
                            // Remove ship after explosion animation
                            const removeTimer = setTimeout(() => {
                                if (ship && ship.parentNode) {
                                    ship.parentNode.removeChild(ship);
                                }
                            }, 1000);
                            
                            battleAnimationTimers.push(removeTimer);
                        }
                    }, Math.random() * 2000);
                    
                    battleAnimationTimers.push(explosionTimer);
                }
            }
        }, delay);
        
        battleAnimationTimers.push(roundTimer);
    }

    function showBattleSummary(summary) {
        const existingSummary = document.getElementById('battleSummaryCard');
        if (existingSummary && existingSummary.parentNode) {
            existingSummary.parentNode.removeChild(existingSummary);
        }

        const normalizedResult = summary.result === 'attackerVictory'
            ? 'Attacker Victory'
            : summary.result === 'defenderVictory'
                ? 'Defender Victory'
                : 'Inconclusive';
        const visibilityLabel = /stealth/i.test(summary.reason)
            ? 'Limited telemetry (stealth)'
            : /overwhelming/i.test(summary.reason)
                ? 'Limited telemetry (overwhelming force)'
                : 'Full telemetry';

        const card = document.createElement('div');
        card.id = 'battleSummaryCard';
        card.style.position = 'fixed';
        card.style.right = '20px';
        card.style.bottom = '20px';
        card.style.maxWidth = '360px';
        card.style.padding = '14px 16px';
        card.style.borderRadius = '10px';
        card.style.background = 'rgba(10, 16, 33, 0.94)';
        card.style.border = '1px solid rgba(130, 170, 255, 0.45)';
        card.style.color = '#dce7ff';
        card.style.fontSize = '13px';
        card.style.lineHeight = '1.35';
        card.style.zIndex = '1200';
        card.innerHTML = `
            <div style="font-size: 14px; font-weight: bold; margin-bottom: 6px;">Battle Summary: Sector ${summary.sector}</div>
            <div>Outcome: ${normalizedResult}</div>
            <div>Winner: Player ${summary.winnerId}</div>
            <div>Losses - Attackers: ${summary.attackerLosses}, Defenders: ${summary.defenderLosses}</div>
            <div>Visibility: ${visibilityLabel}</div>
            <div>Force Ratio: ${summary.forceRatio}</div>
        `;
        document.body.appendChild(card);

        const timer = setTimeout(() => {
            if (card.parentNode) {
                card.parentNode.removeChild(card);
            }
        }, 7000);
        battleAnimationTimers.push(timer);
    }
    
    // Clean up all animation timers and elements
	function cleanupBattleVisualization() {
		// Clear all animation timers
		battleAnimationTimers.forEach(timer => clearTimeout(timer));
		battleAnimationTimers = [];
		
		// Remove battle DOM element if it exists
		const battleGround = document.getElementById('battleGround');
		if (battleGround && battleGround.parentNode) {
			battleGround.parentNode.removeChild(battleGround);
		}
	}
    
    return {
        createBattleVisualization,
        cleanupBattleVisualization,
        showBattleSummary
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
