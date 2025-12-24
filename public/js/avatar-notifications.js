/**
 * avatar-notifications.js - Avatar-based notification system
 *
 * Displays notifications as speech bubbles from a race-specific avatar
 * with up/down navigation through notification history
 */

const AvatarNotifications = (function() {
    let container = null;
    let currentRaceId = 1; // Default to Terran
    let notifications = [];
    let currentIndex = 0;
    let maxNotifications = 50;

    // Race avatar configurations (id matches server race IDs)
    const raceAvatars = {
        1: { name: 'Terran Empire', color: '#4a90d9', icon: 'terran' },
        2: { name: 'Silicon Collective', color: '#7b68ee', icon: 'silicon' },
        3: { name: 'Zephyr Swarm', color: '#32cd32', icon: 'zephyr' },
        4: { name: 'Crystalline Entity', color: '#00ffff', icon: 'crystalline' },
        5: { name: 'Void Walkers', color: '#8b008b', icon: 'void' },
        6: { name: 'Mechanicus', color: '#cd853f', icon: 'mechanicus' },
        7: { name: 'Bioform Collective', color: '#228b22', icon: 'bioform' },
        8: { name: 'Star Nomads', color: '#ffd700', icon: 'nomad' },
        9: { name: 'The Ancients', color: '#daa520', icon: 'ancient' },
        10: { name: 'Quantum Entities', color: '#00bfff', icon: 'quantum' },
        11: { name: 'Titan Lords', color: '#b22222', icon: 'titan' },
        12: { name: 'Shadow Realm', color: '#483d8b', icon: 'shadow' }
    };

    // Generate SVG avatar for a race
    function generateAvatar(raceId) {
        const race = raceAvatars[raceId] || raceAvatars[1];
        const color = race.color;

        // Different avatar shapes/styles per race
        const avatarStyles = {
            terran: `<circle cx="32" cy="28" r="16" fill="${color}"/>
                     <rect x="20" y="46" width="24" height="18" rx="4" fill="${color}"/>
                     <circle cx="26" cy="26" r="3" fill="#fff"/>
                     <circle cx="38" cy="26" r="3" fill="#fff"/>`,
            silicon: `<rect x="16" y="16" width="32" height="32" rx="4" fill="${color}"/>
                      <rect x="22" y="22" width="8" height="8" fill="#0ff"/>
                      <rect x="34" y="22" width="8" height="8" fill="#0ff"/>
                      <rect x="22" y="36" width="20" height="4" fill="#0ff"/>`,
            zephyr: `<ellipse cx="32" cy="32" rx="20" ry="16" fill="${color}"/>
                     <ellipse cx="26" cy="28" r="4" fill="#ff0"/>
                     <ellipse cx="38" cy="28" r="4" fill="#ff0"/>
                     <path d="M24 38 Q32 44 40 38" stroke="#ff0" stroke-width="2" fill="none"/>`,
            crystalline: `<polygon points="32,8 52,28 42,52 22,52 12,28" fill="${color}" opacity="0.8"/>
                          <polygon points="32,16 44,28 38,44 26,44 20,28" fill="#fff" opacity="0.3"/>
                          <circle cx="28" cy="28" r="3" fill="#fff"/>
                          <circle cx="36" cy="28" r="3" fill="#fff"/>`,
            void: `<circle cx="32" cy="32" r="22" fill="#1a0a2e"/>
                   <circle cx="32" cy="32" r="18" fill="${color}" opacity="0.6"/>
                   <circle cx="26" cy="28" r="4" fill="#ff00ff"/>
                   <circle cx="38" cy="28" r="4" fill="#ff00ff"/>`,
            mechanicus: `<rect x="14" y="14" width="36" height="36" fill="${color}"/>
                         <circle cx="24" cy="26" r="5" fill="#f00"/>
                         <circle cx="40" cy="26" r="5" fill="#f00"/>
                         <rect x="20" y="38" width="24" height="6" fill="#666"/>
                         <rect x="24" y="40" width="4" height="2" fill="#f00"/>
                         <rect x="32" y="40" width="4" height="2" fill="#f00"/>`,
            bioform: `<ellipse cx="32" cy="32" rx="18" ry="22" fill="${color}"/>
                      <circle cx="26" cy="26" r="5" fill="#0f0"/>
                      <circle cx="38" cy="26" r="5" fill="#0f0"/>
                      <ellipse cx="32" cy="42" rx="8" ry="4" fill="#0a0"/>
                      <path d="M14 20 Q10 10 16 8" stroke="${color}" stroke-width="4" fill="none"/>
                      <path d="M50 20 Q54 10 48 8" stroke="${color}" stroke-width="4" fill="none"/>`,
            nomad: `<path d="M32 10 L48 50 L16 50 Z" fill="${color}"/>
                    <circle cx="32" cy="30" r="10" fill="#222"/>
                    <circle cx="28" cy="28" r="2" fill="#ffd700"/>
                    <circle cx="36" cy="28" r="2" fill="#ffd700"/>
                    <path d="M28 34 L36 34" stroke="#ffd700" stroke-width="2"/>`,
            ancient: `<circle cx="32" cy="32" r="20" fill="${color}"/>
                      <circle cx="32" cy="32" r="16" fill="none" stroke="#fff" stroke-width="1" opacity="0.5"/>
                      <circle cx="26" cy="28" r="4" fill="#fff"/>
                      <circle cx="38" cy="28" r="4" fill="#fff"/>
                      <path d="M24 40 Q32 46 40 40" stroke="#fff" stroke-width="2" fill="none"/>`,
            quantum: `<circle cx="32" cy="32" r="18" fill="none" stroke="${color}" stroke-width="3"/>
                      <circle cx="32" cy="32" r="12" fill="${color}" opacity="0.5"/>
                      <circle cx="32" cy="32" r="6" fill="#fff"/>
                      <circle cx="20" cy="20" r="4" fill="${color}"/>
                      <circle cx="44" cy="20" r="4" fill="${color}"/>
                      <circle cx="32" cy="50" r="4" fill="${color}"/>`,
            titan: `<rect x="12" y="16" width="40" height="40" rx="6" fill="${color}"/>
                    <rect x="18" y="22" width="10" height="10" fill="#ff4500"/>
                    <rect x="36" y="22" width="10" height="10" fill="#ff4500"/>
                    <rect x="20" y="40" width="24" height="8" fill="#8b0000"/>`,
            shadow: `<circle cx="32" cy="32" r="22" fill="#1a1a2e"/>
                     <circle cx="32" cy="32" r="18" fill="${color}" opacity="0.4"/>
                     <ellipse cx="26" cy="28" rx="5" ry="6" fill="#9400d3"/>
                     <ellipse cx="38" cy="28" rx="5" ry="6" fill="#9400d3"/>
                     <path d="M20 44 Q32 38 44 44" stroke="#4b0082" stroke-width="3" fill="none"/>`
        };

        const style = avatarStyles[race.icon] || avatarStyles.terran;

        return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="avatarGlow${raceId}">
                    <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
                    <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <circle cx="32" cy="32" r="30" fill="url(#avatarGlow${raceId})"/>
            ${style}
        </svg>`;
    }

    function initialize() {
        if (container) return;

        // Create main container
        container = document.createElement('div');
        container.id = 'avatar-notification-system';
        container.innerHTML = `
            <div class="avatar-container">
                <div class="avatar-image" id="raceAvatar"></div>
            </div>
            <div class="speech-bubble-container">
                <div class="speech-bubble" id="speechBubble">
                    <div class="speech-content" id="speechContent">Welcome, Commander!</div>
                    <div class="speech-nav">
                        <button class="nav-btn" id="navUp" title="Previous message">▲</button>
                        <span class="nav-counter" id="navCounter">1/1</span>
                        <button class="nav-btn" id="navDown" title="Next message">▼</button>
                    </div>
                </div>
                <div class="speech-pointer"></div>
            </div>
        `;

        addStyles();
        document.body.appendChild(container);

        // Set up event listeners
        document.getElementById('navUp').addEventListener('click', () => navigate(-1));
        document.getElementById('navDown').addEventListener('click', () => navigate(1));

        // Set default avatar
        updateAvatar(currentRaceId);

        // Add initial welcome message
        addNotification('Welcome to Game of Worlds, Commander!', 'info');
    }

    function addStyles() {
        const style = document.createElement('style');
        style.id = 'avatar-notification-styles';
        style.textContent = `
            #avatar-notification-system {
                position: fixed;
                top: 100px;
                right: 10px;
                display: flex;
                flex-direction: row-reverse;
                align-items: flex-start;
                gap: 12px;
                z-index: 150;
                pointer-events: none;
            }

            .avatar-container {
                width: 72px;
                height: 72px;
                border-radius: 50%;
                background: linear-gradient(145deg, rgba(30, 35, 55, 0.95), rgba(20, 25, 40, 0.95));
                border: 2px solid rgba(255, 255, 255, 0.15);
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
                overflow: hidden;
                flex-shrink: 0;
                pointer-events: auto;
            }

            .avatar-image {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .avatar-image svg {
                width: 64px;
                height: 64px;
            }

            .speech-bubble-container {
                position: relative;
                max-width: 280px;
                pointer-events: auto;
            }

            .speech-bubble {
                background: linear-gradient(145deg, rgba(30, 35, 55, 0.98), rgba(20, 25, 40, 0.98));
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 12px;
                padding: 12px 14px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
                color: #e8ecff;
                font-size: 13px;
                line-height: 1.5;
            }

            .speech-content {
                margin-bottom: 8px;
                min-height: 20px;
            }

            .speech-content.success { color: #5df5b4; }
            .speech-content.error { color: #ff8a80; }
            .speech-content.warning { color: #ffd56c; }
            .speech-content.info { color: #60d8ff; }

            .speech-nav {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                padding-top: 8px;
                margin-top: 4px;
            }

            .nav-btn {
                width: 24px;
                height: 24px;
                border: none;
                background: rgba(255, 255, 255, 0.08);
                color: #cfd7ff;
                border-radius: 4px;
                cursor: pointer;
                font-size: 10px;
                transition: background 0.15s ease;
            }

            .nav-btn:hover {
                background: rgba(255, 255, 255, 0.15);
            }

            .nav-btn:disabled {
                opacity: 0.3;
                cursor: not-allowed;
            }

            .nav-counter {
                font-size: 11px;
                color: rgba(207, 215, 255, 0.6);
                min-width: 40px;
                text-align: center;
            }

            .speech-pointer {
                position: absolute;
                right: -8px;
                top: 20px;
                width: 0;
                height: 0;
                border-top: 8px solid transparent;
                border-bottom: 8px solid transparent;
                border-left: 8px solid rgba(30, 35, 55, 0.98);
            }

            /* Animation for new messages */
            @keyframes bubblePop {
                0% { transform: scale(0.95); opacity: 0.7; }
                50% { transform: scale(1.02); }
                100% { transform: scale(1); opacity: 1; }
            }

            .speech-bubble.new-message {
                animation: bubblePop 0.3s ease-out;
            }

            /* Mobile responsive */
            @media (max-width: 768px) {
                #avatar-notification-system {
                    top: auto;
                    bottom: 400px;
                    right: 10px;
                    flex-direction: column;
                    align-items: flex-end;
                }

                .avatar-container {
                    width: 56px;
                    height: 56px;
                    order: 1;
                }

                .avatar-image svg {
                    width: 48px;
                    height: 48px;
                }

                .speech-bubble-container {
                    order: 0;
                    max-width: 200px;
                }

                .speech-bubble {
                    font-size: 12px;
                    padding: 10px 12px;
                }

                .speech-pointer {
                    display: none;
                }
            }

            @media (max-width: 480px) {
                #avatar-notification-system {
                    display: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function setRace(raceId) {
        currentRaceId = raceId || 1;
        updateAvatar(currentRaceId);
    }

    function updateAvatar(raceId) {
        const avatarEl = document.getElementById('raceAvatar');
        if (avatarEl) {
            avatarEl.innerHTML = generateAvatar(raceId);
        }
    }

    function addNotification(message, type = 'info') {
        const notification = {
            message,
            type,
            timestamp: Date.now()
        };

        notifications.unshift(notification);
        if (notifications.length > maxNotifications) {
            notifications.pop();
        }

        currentIndex = 0;
        updateDisplay();

        // Animate
        const bubble = document.getElementById('speechBubble');
        if (bubble) {
            bubble.classList.remove('new-message');
            void bubble.offsetWidth; // Force reflow
            bubble.classList.add('new-message');
        }
    }

    function navigate(direction) {
        const newIndex = currentIndex + direction;
        if (newIndex >= 0 && newIndex < notifications.length) {
            currentIndex = newIndex;
            updateDisplay();
        }
    }

    function updateDisplay() {
        const contentEl = document.getElementById('speechContent');
        const counterEl = document.getElementById('navCounter');
        const upBtn = document.getElementById('navUp');
        const downBtn = document.getElementById('navDown');

        if (!contentEl || notifications.length === 0) return;

        const current = notifications[currentIndex];
        contentEl.textContent = current.message;
        contentEl.className = `speech-content ${current.type}`;

        if (counterEl) {
            counterEl.textContent = `${currentIndex + 1}/${notifications.length}`;
        }

        if (upBtn) upBtn.disabled = currentIndex === 0;
        if (downBtn) downBtn.disabled = currentIndex >= notifications.length - 1;
    }

    // Convenience methods matching NotificationSystem API
    function show(message, type = 'info') {
        addNotification(message, type);
    }

    const game = {
        connected: () => show('Connected to game server', 'success'),
        disconnected: () => show('Connection lost!', 'error'),
        turnComplete: () => show('Turn completed', 'info'),
        battleWon: (sector) => show(`Victory in sector ${sector}!`, 'success'),
        battleLost: (sector) => show(`Defeat in sector ${sector}`, 'error'),
        resourcesLow: () => show('Resources running low!', 'warning'),
        techUnlocked: (tech) => show(`${tech} researched!`, 'success'),
        buildingComplete: (building) => show(`${building} complete!`, 'success'),
        shipBuilt: (ship) => show(`${ship} constructed`, 'info'),
        sectorColonized: (sector) => show(`Sector ${sector} colonized!`, 'success'),
        underAttack: (sector) => show(`Sector ${sector} under attack!`, 'error')
    };

    return {
        initialize,
        setRace,
        show,
        addNotification,
        game
    };
})();

// Auto-initialize
if (typeof window !== 'undefined') {
    window.AvatarNotifications = AvatarNotifications;
    document.addEventListener('DOMContentLoaded', () => {
        AvatarNotifications.initialize();
    });
}
