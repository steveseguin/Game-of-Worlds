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
    
    function createBattleVisualization(message) {
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
        
        // Create battle container
        const battleDiv = document.createElement('div');
        battleDiv.id = 'battleGround';
        battleDiv.style.position = 'absolute';
        battleDiv.style.left = '10%';
        battleDiv.style.width = '80%';
        battleDiv.style.height = '80%';
        battleDiv.style.top = '10%';
        battleDiv.style.background = '#000';
        battleDiv.style.backgroundImage = 'url(spacebak.jpg)';
        battleDiv.style.zIndex = '1000';
        battleDiv.style.display = 'block';
        document.body.appendChild(battleDiv);
        
        // Add skip button
        const skipButton = document.createElement('button');
        skipButton.id = 'stopBattle';
        skipButton.style.position = 'absolute';
        skipButton.style.right = '15%';
        skipButton.style.width = '5%';
        skipButton.style.height = '3%';
        skipButton.style.top = '10%';
        skipButton.innerHTML = 'SKIP';
        skipButton.onclick = () => {
            document.body.removeChild(battleDiv);
        };
        battleDiv.appendChild(skipButton);
        
        // Add headers
        const attackerHeader = document.createElement('h1');
        attackerHeader.id = 'atttxt';
        attackerHeader.style.position = 'absolute';
        attackerHeader.style.right = '15%';
        attackerHeader.style.top = '12%';
        attackerHeader.innerHTML = 'Attackers';
        battleDiv.appendChild(attackerHeader);
        
        const defenderHeader = document.createElement('h1');
        defenderHeader.id = 'deftxt';
        defenderHeader.style.position = 'absolute';
        defenderHeader.style.right = '80%';
        defenderHeader.style.top = '12%';
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
            groundImg.src = 'ground.gif';
            battleDiv.appendChild(groundImg);
            
            const baseImg = document.createElement('img');
            baseImg.id = '1d010';
            baseImg.style.position = 'absolute';
            baseImg.style.left = '15%';
            baseImg.style.top = '60%';
            baseImg.src = 'base.png';
            battleDiv.appendChild(baseImg);
        }
        
        // Animate battle with destruction sequence
        let round = 1;
        while ((round * 20 + 1) < parts.length && round < 10) {
            animateBattleRound(parts, round, battleDiv);
            round++;
        }
        
        // Automatically close after 20 seconds
        const closeTimer = setTimeout(() => {
            if (document.getElementById('battleGround')) {
                document.body.removeChild(document.getElementById('battleGround'));
            }
        }, 20000);
        
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
        img.src = 'ship' + shipType + '.png';
        container.appendChild(img);
    }
    
    function animateBattleRound(battleData, round, container) {
        const delay = 5000 * round;
        
        const roundTimer = setTimeout(() => {
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
                            ship.src = 'boom.gif';
                            
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