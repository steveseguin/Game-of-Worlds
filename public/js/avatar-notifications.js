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
    const WELCOME_STORAGE_KEY = 'gow-avatar-welcome-dismissed-v1';

    // Race avatar configurations (id matches server race IDs)
    const raceAvatars = {
        1: { name: 'Terran Empire', color: '#4a90d9', asset: './images/terran-icon.svg' },
        2: { name: 'Silicon Collective', color: '#7b68ee', asset: './images/silicon-icon.svg' },
        3: { name: 'Zephyr Swarm', color: '#32cd32', asset: './images/zephyr-icon.svg' },
        4: { name: 'Crystalline Entity', color: '#00ffff', asset: './images/crystalline-icon.svg' },
        5: { name: 'Void Walkers', color: '#8b008b', asset: './images/void-icon.svg' },
        6: { name: 'Mechanicus', color: '#cd853f', asset: './images/mechanicus-icon.svg' },
        7: { name: 'Bioform Collective', color: '#228b22', asset: './images/bioform-icon.svg' },
        8: { name: 'Star Nomads', color: '#ffd700', asset: './images/nomad-icon.svg' },
        9: { name: 'The Ancients', color: '#daa520', asset: './images/ancient-icon.svg' },
        10: { name: 'Quantum Entities', color: '#00bfff', asset: './images/quantum-icon.svg' },
        11: { name: 'Titan Lords', color: '#b22222', asset: './images/titan-icon.svg' },
        12: { name: 'Shadow Realm', color: '#483d8b', asset: './images/shadow-icon.svg' }
    };

    // Render race art for the current advisor.
    function generateAvatar(raceId) {
        const race = raceAvatars[raceId] || raceAvatars[1];
        return `
            <div class="avatar-art-frame" style="--race-color:${race.color}">
                <img src="${race.asset}" alt="${race.name}" loading="lazy">
            </div>
        `;
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
                        <button class="nav-btn speech-dismiss" id="speechDismiss" title="Dismiss message" aria-label="Dismiss message">&times;</button>
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
        document.getElementById('speechDismiss').addEventListener('click', dismissCurrent);
        document.getElementById('navUp').textContent = String.fromCharCode(9650);
        document.getElementById('navDown').textContent = String.fromCharCode(9660);

        // Set default avatar
        updateAvatar(currentRaceId);

        if (!hasDismissedWelcome()) {
            addNotification('Welcome to Game of Worlds, Commander!', 'info', { welcome: true });
        } else {
            updateDisplay();
        }
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

            .avatar-art-frame {
                width: 100%;
                height: 100%;
                display: grid;
                place-items: center;
                background:
                    radial-gradient(circle at 50% 45%, rgba(255,255,255,0.12), transparent 45%),
                    linear-gradient(145deg, rgba(255,255,255,0.08), rgba(0,0,0,0.18));
            }

            .avatar-art-frame img {
                width: 58px;
                height: 58px;
                object-fit: contain;
                filter: drop-shadow(0 6px 10px rgba(0,0,0,0.45));
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

            .speech-dismiss {
                border: 1px solid rgba(255, 255, 255, 0.14);
                color: #ffd3d3;
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

                .avatar-art-frame img {
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

    function hasDismissedWelcome() {
        try {
            return localStorage.getItem(WELCOME_STORAGE_KEY) === '1';
        } catch (err) {
            return false;
        }
    }

    function markWelcomeDismissed() {
        try {
            localStorage.setItem(WELCOME_STORAGE_KEY, '1');
        } catch (err) { /* ignore */ }
    }

    function addNotification(message, type = 'info', options = {}) {
        const notification = {
            message,
            type,
            timestamp: Date.now(),
            welcome: Boolean(options.welcome)
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

    function dismissCurrent() {
        if (notifications.length === 0) {
            updateDisplay();
            return;
        }

        const current = notifications[currentIndex];
        if (current && current.welcome) {
            markWelcomeDismissed();
        }

        notifications.splice(currentIndex, 1);
        currentIndex = Math.max(0, Math.min(currentIndex, notifications.length - 1));
        updateDisplay();
    }

    function updateDisplay() {
        const contentEl = document.getElementById('speechContent');
        const counterEl = document.getElementById('navCounter');
        const upBtn = document.getElementById('navUp');
        const downBtn = document.getElementById('navDown');
        const bubbleEl = document.getElementById('speechBubble');

        if (!contentEl) return;
        if (notifications.length === 0) {
            if (bubbleEl) {
                bubbleEl.style.display = 'none';
            }
            return;
        }

        if (bubbleEl) {
            bubbleEl.style.display = 'block';
        }

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
