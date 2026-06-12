// game-screen.js - shared game screen sizing, title, and audio controls.
(function() {
    const BASE_WIDTH = 1280;
    const BASE_HEIGHT = 760;
    let resizeTimer = null;
    let currentTitle = 'Galaxy Map';

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function setImportant(el, property, value) {
        if (!el) return;
        el.style.setProperty(property, value, 'important');
    }

    function px(value) {
        return `${Math.round(value)}px`;
    }

    function applyResponsiveLayout() {
        const viewportWidth = window.innerWidth || BASE_WIDTH;
        const viewportHeight = window.innerHeight || BASE_HEIGHT;
        const minScale = viewportWidth < 480 ? 0.46 : viewportWidth < 760 ? 0.54 : 0.62;
        const scale = clamp(Math.min(viewportWidth / BASE_WIDTH, viewportHeight / BASE_HEIGHT), minScale, 1.08);
        const narrow = viewportWidth < 760;
        const short = viewportHeight < 620;
        const compact = narrow || short;
        const veryNarrow = viewportWidth < 560;
        const shortLandscape = viewportHeight < 460 && viewportWidth > viewportHeight;
        const stackBottomPanels = veryNarrow && !shortLandscape;

        document.documentElement.style.setProperty('--game-scale', scale.toFixed(3));
        document.body.classList.toggle('game-compact', compact);
        document.body.style.zoom = '';
        document.body.style.width = '';
        document.body.style.height = '';

        const chatHeight = clamp(40 * scale, 34, 46);
        const controlMaxWidth = Math.max(220, viewportWidth - 12);
        const controlMinWidth = Math.min(280, controlMaxWidth);
        let controlWidth = clamp(Math.min(500 * scale, controlMaxWidth), controlMinWidth, controlMaxWidth);
        if (stackBottomPanels) {
            controlWidth = controlMaxWidth;
        }

        const controlMaxHeight = shortLandscape ? Math.max(140, viewportHeight * 0.34) : compact ? Math.max(170, viewportHeight * (veryNarrow ? 0.32 : 0.4)) : 380;
        const controlMinHeight = Math.min(veryNarrow ? 176 : 210, controlMaxHeight);
        const controlHeight = clamp((compact ? 280 : 320) * scale, controlMinHeight, controlMaxHeight);

        let minimapWidth = Math.min(500 * scale, viewportWidth * (stackBottomPanels ? 0.42 : 0.36));
        minimapWidth = clamp(minimapWidth, stackBottomPanels ? 128 : 190, 560);
        if (!stackBottomPanels && controlWidth + minimapWidth > viewportWidth - 18) {
            minimapWidth = clamp(viewportWidth - controlWidth - 18, 180, minimapWidth);
        }
        const minimapHeight = minimapWidth * (356 / 500);
        const minimapBottom = stackBottomPanels ? chatHeight + controlHeight + 8 : 0;
        const bottomReserved = stackBottomPanels
            ? chatHeight + controlHeight + minimapHeight + 18
            : chatHeight + controlHeight + 12;
        const turnWidth = clamp(300 * scale, veryNarrow ? 112 : 190, 330);
        const turnHeight = clamp(90 * scale, veryNarrow ? 48 : 58, 96);
        const topReserved = stackBottomPanels ? Math.max(150, turnHeight + 102) : compact ? 76 : 80 * scale;

        const chatContainer = document.getElementById('chatContainer');
        const chatFeed = document.getElementById('chatFeed');
        const controlPad = document.getElementById('controlPadGUI');
        const minimap = document.getElementById('minimapid');
        const resourceBar = document.getElementById('resourceBar');
        const turnBar = document.getElementById('turnTimeBar');
        const utilityButtons = document.getElementById('utilityButtons');
        const connectionInfo = document.getElementById('connectionInfo');
        const sectorDisplay = document.getElementById('sectordisplay');
        const sectorImage = document.getElementById('sectorimg');
        const viewTitle = document.getElementById('viewTitle');
        const avatar = document.getElementById('avatar-notification-system');

        if (chatContainer) {
            setImportant(chatContainer, 'width', px(controlWidth));
            setImportant(chatContainer, 'height', px(chatHeight));
            setImportant(chatContainer, 'padding', `${px(Math.max(4, 5 * scale))} ${px(Math.max(8, 10 * scale))}`);
        }

        if (chatFeed) {
            setImportant(chatFeed, 'width', px(controlWidth));
            setImportant(chatFeed, 'bottom', px(chatHeight + controlHeight + 8));
            setImportant(chatFeed, 'max-height', px(Math.max(96, controlHeight * 0.42)));
            setImportant(chatFeed, 'font-size', `${clamp(12 * scale, 11, 14)}px`);
        }

        if (controlPad) {
            setImportant(controlPad, 'width', px(controlWidth));
            setImportant(controlPad, 'height', px(controlHeight));
            setImportant(controlPad, 'bottom', px(chatHeight));
            controlPad.style.fontSize = `${clamp(13 * scale, 11, 15)}px`;
        }

        if (minimap) {
            setImportant(minimap, 'width', px(minimapWidth));
            setImportant(minimap, 'height', px(minimapHeight));
            setImportant(minimap, 'right', stackBottomPanels ? '8px' : '0');
            setImportant(minimap, 'bottom', px(minimapBottom));
        }

        if (resourceBar) {
            const resourceWidth = veryNarrow
                ? Math.max(140, viewportWidth - turnWidth - 8)
                : Math.min(500 * scale, viewportWidth - turnWidth - 24);
            setImportant(resourceBar, 'width', px(Math.min(viewportWidth, Math.max(140, resourceWidth))));
            resourceBar.style.fontSize = `${clamp(13 * scale, 10.5, 14)}px`;
        }

        if (turnBar) {
            setImportant(turnBar, 'width', px(turnWidth));
            setImportant(turnBar, 'height', px(turnHeight));
            turnBar.style.fontSize = `${clamp(13 * scale, 10.5, 14)}px`;
        }

        if (utilityButtons && turnBar) {
            setImportant(utilityButtons, 'right', veryNarrow ? '8px' : px(turnWidth + 10));
            setImportant(utilityButtons, 'top', veryNarrow ? px(turnHeight + 6) : px(8));
        }

        if (connectionInfo) {
            setImportant(connectionInfo, 'position', 'fixed');
            if (veryNarrow) {
                setImportant(connectionInfo, 'left', '8px');
                setImportant(connectionInfo, 'top', px(turnHeight + 42));
                setImportant(connectionInfo, 'max-width', px(viewportWidth - 16));
            } else if (viewportWidth < 1000) {
                setImportant(connectionInfo, 'left', '8px');
                setImportant(connectionInfo, 'top', px(44));
                setImportant(connectionInfo, 'max-width', px(viewportWidth - 16));
            } else {
                setImportant(connectionInfo, 'left', px(Math.min(550 * scale, viewportWidth - 720)));
                setImportant(connectionInfo, 'top', px(8));
                setImportant(connectionInfo, 'max-width', px(Math.max(260, viewportWidth - 860)));
            }
            connectionInfo.style.fontSize = `${clamp(13 * scale, 11, 14)}px`;
        }

        if (sectorDisplay) {
            const sectorMaxWidth = veryNarrow ? Math.max(132, viewportWidth * 0.48) : 300;
            const sectorMinWidth = Math.min(veryNarrow ? 150 : 190, sectorMaxWidth);
            const sectorWidth = clamp(240 * scale, sectorMinWidth, sectorMaxWidth);
            const sectorMaxHeight = Math.max(64, viewportHeight - topReserved - bottomReserved - 12);
            setImportant(sectorDisplay, 'display', shortLandscape ? 'none' : 'block');
            setImportant(sectorDisplay, 'top', px(topReserved));
            setImportant(sectorDisplay, 'left', px(10));
            setImportant(sectorDisplay, 'width', px(sectorWidth));
            setImportant(sectorDisplay, 'max-height', px(sectorMaxHeight));
            setImportant(sectorDisplay, 'overflow-y', 'auto');
            sectorDisplay.style.fontSize = `${clamp(12 * scale, 10.5, 13)}px`;
        }

        if (sectorImage) {
            const sectorDisplayWidth = veryNarrow ? Math.max(132, viewportWidth * 0.48) : 190;
            const left = veryNarrow ? Math.max(sectorDisplayWidth + 24, viewportWidth * 0.52) : clamp(300 * scale, 190, viewportWidth * 0.35);
            const imageTop = veryNarrow ? topReserved : compact ? 78 : 70 * scale;
            setImportant(sectorImage, 'left', px(left));
            setImportant(sectorImage, 'top', px(imageTop));
            setImportant(sectorImage, 'width', `calc(100% - ${px(left)})`);
            setImportant(sectorImage, 'height', `calc(100% - ${px(imageTop)})`);
        }

        if (viewTitle) {
            const sidePad = veryNarrow ? 84 : 330 * scale;
            setImportant(viewTitle, 'display', shortLandscape ? 'none' : 'block');
            setImportant(viewTitle, 'left', px(Math.min(sidePad, viewportWidth * 0.28)));
            setImportant(viewTitle, 'right', px(Math.min(sidePad, viewportWidth * 0.28)));
            setImportant(viewTitle, 'top', px(veryNarrow ? Math.max(126, turnHeight + 78) : 50 * scale));
            viewTitle.style.transform = 'none';
            viewTitle.style.fontSize = `${clamp(14 * scale, 12, 16)}px`;
        }

        if (avatar) {
            avatar.style.transform = `scale(${clamp(scale, 0.78, 1.08)})`;
            avatar.style.transformOrigin = 'top right';
        }

        if (window.GalaxyMap?.resize) {
            requestAnimationFrame(() => window.GalaxyMap.resize());
        }
    }

    function setTitle(label, browserTitle) {
        currentTitle = label || 'Galaxy Map';
        const viewTitle = document.getElementById('viewTitle');
        if (viewTitle) {
            viewTitle.textContent = currentTitle;
        }
        document.title = browserTitle || `${currentTitle} - Game of Worlds`;
    }

    function restoreTitle() {
        const selectedSector = window.GalaxyMap?.getSelectedSector?.();
        if (selectedSector) {
            const label = Number(selectedSector).toString(16).toUpperCase();
            setTitle(`Sector ${label}`, `Sector ${label} - Game of Worlds`);
            return;
        }
        setTitle('Galaxy Map');
    }

    function updateAudioButton(muted) {
        const btn = document.getElementById('audioBtn');
        if (!btn) return;
        btn.textContent = muted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
        btn.title = muted ? 'Unmute sound' : 'Mute sound';
        btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    }

    function setAudioMuted(muted) {
        const nextMuted = Boolean(muted);
        try {
            localStorage.setItem('gow-muted', nextMuted ? 'on' : 'off');
        } catch (_) {}

        if (window.SoundSystem?.setEnabled) {
            window.SoundSystem.setEnabled(!nextMuted);
        } else if (nextMuted && window.SoundSystem?.stopMusic) {
            window.SoundSystem.stopMusic(false);
        }

        if (window.MediaManager?.setMuted) {
            window.MediaManager.setMuted(nextMuted);
        }

        updateAudioButton(nextMuted);
        return !nextMuted;
    }

    function toggleAudioMuted() {
        let muted = false;
        try {
            muted = localStorage.getItem('gow-muted') === 'on';
        } catch (_) {}
        return setAudioMuted(!muted);
    }

    function initializeAudioButton() {
        let muted = false;
        try {
            muted = localStorage.getItem('gow-muted') === 'on';
        } catch (_) {}
        setAudioMuted(muted);
        document.getElementById('audioBtn')?.addEventListener('click', toggleAudioMuted);
    }

    window.GameScreen = {
        applyResponsiveLayout,
        setTitle,
        restoreTitle,
        setAudioMuted,
        toggleAudioMuted
    };

    document.addEventListener('DOMContentLoaded', () => {
        applyResponsiveLayout();
        setTitle('Galaxy Map');
        initializeAudioButton();
    });

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(applyResponsiveLayout, 80);
    });
})();
