// game-screen.js - shared game screen sizing, title, and audio controls.
(function() {
    const BASE_WIDTH = 1280;
    const BASE_HEIGHT = 760;
    let resizeTimer = null;
    const DEFAULT_TITLE = 'Galaxy Map';
    let currentTitle = DEFAULT_TITLE;
    // "Galaxy Map" over a picture of the galaxy map tells the player nothing they cannot
    // see, so the badge stays hidden while the title is the default. It still appears for
    // titles that carry information - "Battle in Sector 19", "Sector 4" - which is the
    // only reason the badge exists. The browser tab title is set either way.
    let titleIsDefault = true;

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
        // Side by side at the bottom, the minimap gets whatever the build pad leaves. The
        // clamp below has a 180px floor, which used to be applied even when less than
        // 180px remained — so the minimap was forced to a width that did not fit and
        // printed over the build pad (caught at 439x436). If it genuinely cannot fit,
        // drop it: it duplicates the main 3D view, which is the one thing on screen that
        // is definitely still visible.
        let minimapCrowdedOut = false;
        if (!stackBottomPanels && controlWidth + minimapWidth > viewportWidth - 18) {
            const room = viewportWidth - controlWidth - 18;
            if (room < 180) {
                minimapCrowdedOut = true;
            } else {
                minimapWidth = clamp(room, 180, minimapWidth);
            }
        }
        const minimapHeight = minimapWidth * (356 / 500);
        // Provisional: recomputed below from the control pad's MEASURED height, because
        // the narrow-screen media queries override it with their own !important rules
        // and the two used to disagree by ~70px — enough to bury the sector panel.
        let measuredControlHeight = controlHeight;
        let minimapBottom = stackBottomPanels ? chatHeight + controlHeight + 8 : 0;
        let bottomReserved = stackBottomPanels
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
        const galaxyViewport = document.getElementById('galaxy3d');
        const viewTitle = document.getElementById('viewTitle');
        const avatar = document.getElementById('avatar-notification-system');
        const empireSummary = document.getElementById('empireSummary');
        const mapLegend = document.getElementById('mapLegend');

        if (chatContainer) {
            setImportant(chatContainer, 'width', px(controlWidth));
            setImportant(chatContainer, 'height', px(chatHeight));
            setImportant(chatContainer, 'padding', `${px(Math.max(4, 5 * scale))} ${px(Math.max(8, 10 * scale))}`);
        }

        // Opt-in: the player can hand the build pad's screen space back to the map.
        // Because bottomReserved is derived from the MEASURED pad height, collapsing it
        // automatically re-expands the sector panel and the 3D view's safe area.
        const controlPadCollapsed = document.body.classList.contains('controlpad-collapsed');
        if (controlPad) {
            setImportant(controlPad, 'display', controlPadCollapsed ? 'none' : 'block');
            setImportant(controlPad, 'width', px(controlWidth));
            setImportant(controlPad, 'height', px(controlHeight));
            setImportant(controlPad, 'bottom', px(chatHeight));
            controlPad.style.fontSize = `${clamp(13 * scale, 11, 15)}px`;
            // Trust the rendered box, not the request: media queries can win.
            measuredControlHeight = controlPadCollapsed
                ? 0
                : Math.max(controlHeight, controlPad.getBoundingClientRect().height);
            minimapBottom = stackBottomPanels ? chatHeight + measuredControlHeight + 8 : 0;
            bottomReserved = stackBottomPanels
                ? chatHeight + measuredControlHeight + minimapHeight + 18
                : chatHeight + measuredControlHeight + 12;
        }

        if (chatFeed) {
            setImportant(chatFeed, 'width', px(controlWidth));
            setImportant(chatFeed, 'bottom', px(chatHeight + measuredControlHeight + 8));
            setImportant(chatFeed, 'max-height', px(Math.max(96, measuredControlHeight * 0.42)));
            setImportant(chatFeed, 'font-size', `${clamp(12 * scale, 11, 14)}px`);
        }

        // Two different reasons the minimap can be absent, and they must stay separate.
        // The player can hand its space back deliberately (minimapCollapsed), and on a
        // short phone screen we drop it regardless because the stacked minimap, build pad
        // and chat leave no room for the status column — it duplicates the main 3D view,
        // which is already full-screen there.
        const minimapCollapsed = document.body.classList.contains('minimap-collapsed');
        const hideMinimap = minimapCollapsed
            || minimapCrowdedOut
            || (stackBottomPanels && viewportHeight < 720);
        // Only the stacked layout ever counted the minimap in bottomReserved, so only the
        // stacked layout may take it back out. Subtracting in the side-by-side layout would
        // reserve less than the chat and build pad actually occupy.
        if (hideMinimap && stackBottomPanels) {
            bottomReserved -= minimapHeight + 6;
            minimapBottom = chatHeight + measuredControlHeight + 8;
        }

        if (minimap) {
            setImportant(minimap, 'display', hideMinimap ? 'none' : 'block');
            setImportant(minimap, 'width', px(minimapWidth));
            setImportant(minimap, 'height', px(minimapHeight));
            setImportant(minimap, 'right', stackBottomPanels ? '8px' : '0');
            setImportant(minimap, 'bottom', px(minimapBottom));
        }

        if (mapLegend) {
            const legendWidth = clamp(220 * scale, 150, 260);
            const legendRight = stackBottomPanels ? 8 : Math.min(370, minimapWidth * 0.72);
            // The legend sits above the minimap on the right. On a narrow window the
            // build pad reaches across and they collide, so drop the legend rather
            // than print two panels on top of each other.
            const legendRoom = viewportWidth - controlWidth - legendRight - legendWidth - 16;
            setImportant(mapLegend, 'width', px(legendWidth));
            setImportant(mapLegend, 'right', px(legendRight));
            // The legend normally rides above the minimap. With the minimap gone it should
            // drop to sit above the chat instead, not hover over the space it used to fill.
            setImportant(mapLegend, 'bottom', px(hideMinimap
                ? chatHeight + measuredControlHeight + 8
                : minimapBottom + minimapHeight + 8));
            setImportant(mapLegend, 'display',
                (shortLandscape || veryNarrow || legendRoom < 0) ? 'none' : 'block');
            mapLegend.style.fontSize = `${clamp(11 * scale, 9.5, 12)}px`;
        }

        if (turnBar) {
            setImportant(turnBar, 'width', px(turnWidth));
            setImportant(turnBar, 'height', px(turnHeight));
            turnBar.style.fontSize = `${clamp(13 * scale, 10.5, 14)}px`;
        }

        const resourceWidth = veryNarrow
            ? Math.max(140, viewportWidth - turnWidth - 8)
            : Math.min(viewportWidth, Math.max(140, Math.min(500 * scale, viewportWidth - turnWidth - 24)));

        let utilityWidth = 0;
        let utilityRowBottom = 0;
        if (utilityButtons && turnBar) {
            utilityWidth = utilityButtons.getBoundingClientRect().width;
            // These sit left of the turn clock on the top row. On a narrow window that
            // row also carries the resource bar, and the two used to overlap — drop the
            // buttons onto their own row below the clock instead.
            const topRowFits = viewportWidth - turnWidth - 10 - utilityWidth >= resourceWidth + 8;
            const stackUtility = veryNarrow || !topRowFits;
            setImportant(utilityButtons, 'right', stackUtility ? '8px' : px(turnWidth + 10));
            setImportant(utilityButtons, 'top', stackUtility ? px(turnHeight + 6) : px(8));
            if (stackUtility) {
                utilityWidth = 0; // no longer competing for the top row
                utilityRowBottom = turnHeight + 6 + utilityButtons.getBoundingClientRect().height + 6;
            }
        }

        // ---- Top-left status column -------------------------------------------------
        // Resources, connection, empire income, victory progress and the sector panel
        // are stacked by MEASURING each block rather than by hard-coded tops. Fixed
        // offsets drifted apart from the scaled font sizes and left these panels
        // printing over each other at common laptop resolutions.
        let columnTop = veryNarrow ? turnHeight + 8 : 0;
        let columnRight = 0;
        // Trips once a panel runs out of vertical room. Everything further down the
        // column is lower priority, so once this is set the rest stays hidden too.
        let columnCrowded = false;
        const trackColumn = el => {
            const box = el.getBoundingClientRect();
            columnTop += box.height + 4;
            columnRight = Math.max(columnRight, box.right);
        };
        // Commit a panel to the column only if its rendered box clears the bottom
        // furniture. Measuring beats a per-panel threshold: every one of these panels
        // changes height with the font scale and with how much the empire owns, so a
        // constant that looks safe at one size prints over the build pad at another.
        const fitColumn = el => {
            if (columnCrowded) {
                setImportant(el, 'display', 'none');
                return false;
            }
            const room = viewportHeight - columnTop - bottomReserved - 12;
            if (el.getBoundingClientRect().height > room) {
                setImportant(el, 'display', 'none');
                columnCrowded = true;
                return false;
            }
            trackColumn(el);
            return true;
        };

        let resourceBarRight = 0;
        if (resourceBar) {
            setImportant(resourceBar, 'width', px(resourceWidth));
            setImportant(resourceBar, 'top', px(columnTop));
            resourceBar.style.fontSize = `${clamp(13 * scale, 10.5, 14)}px`;
            // Measured, not requested: the connection bar parks to the right of this and
            // needs its true edge, media queries included.
            resourceBarRight = resourceBar.getBoundingClientRect().right;
            trackColumn(resourceBar);
            // When the utility buttons had to drop onto their own row, the rest of the
            // column has to clear them or the connection bar runs underneath.
            columnTop = Math.max(columnTop, utilityRowBottom);
        }

        let inlineInfoBottom = 0;
        if (connectionInfo) {
            setImportant(connectionInfo, 'position', 'fixed');
            setImportant(connectionInfo, 'display', 'block');
            // Inline beside the resource bar only when there is genuinely room between
            // it and the utility buttons; otherwise it becomes the next row of the
            // left column instead of sliding underneath the buttons.
            // Must clear the resource bar, which shares this row. This used to be
            // `min(550 * scale, viewportWidth - 720)`, where the 720 was a guess at how
            // wide the resource bar would be — and at ~1000-1100px wide the guess came in
            // BELOW the bar's real right edge, so the connection bar printed on top of it.
            // Seeded fuzz reproduced it at 1008x521 (55px over) and 1050x549 (31px over);
            // both are exactly resourceWidth - inlineLeft. Measure the bar instead of
            // guessing at it.
            const inlineLeft = Math.max(
                resourceBarRight + 12,
                Math.min(550 * scale, viewportWidth - 720)
            );
            const rightGuard = turnWidth + 10 + utilityWidth + 16;
            const inlineRoom = viewportWidth - rightGuard - inlineLeft;
            // The stylesheet pins both left and right on this bar, which stretches it
            // across the viewport. Release the right edge so it shrink-wraps its
            // content and the column can measure its true width.
            setImportant(connectionInfo, 'right', 'auto');
            if (!veryNarrow && viewportWidth >= 1000 && inlineRoom >= 240) {
                setImportant(connectionInfo, 'left', px(inlineLeft));
                setImportant(connectionInfo, 'top', '8px');
                setImportant(connectionInfo, 'max-width', px(inlineRoom));
                inlineInfoBottom = 8 + connectionInfo.getBoundingClientRect().height;
            } else {
                // Only run the full width once this row is clear of the turn clock,
                // which is pinned top-right and overlaps the first column rows.
                const clearsTurnBar = columnTop >= turnHeight + 4;
                const stackedMax = clearsTurnBar
                    ? viewportWidth - 20
                    : viewportWidth - turnWidth - 24;
                setImportant(connectionInfo, 'left', '10px');
                setImportant(connectionInfo, 'top', px(columnTop));
                setImportant(connectionInfo, 'max-width', px(Math.max(150, stackedMax)));
                fitColumn(connectionInfo);
            }
            connectionInfo.style.fontSize = `${clamp(13 * scale, 11, 14)}px`;
        }

        if (empireSummary) {
            const summaryWidth = veryNarrow
                ? Math.max(150, viewportWidth - 16)
                : Math.min(500 * scale, viewportWidth - turnWidth - 24);
            setImportant(empireSummary, 'display', 'block');
            setImportant(empireSummary, 'width', px(Math.max(150, summaryWidth)));
            setImportant(empireSummary, 'top', px(columnTop));
            setImportant(empireSummary, 'left', '10px');
            empireSummary.style.fontSize = `${clamp(12 * scale, 10, 13)}px`;
            // Income yields last of the column, but on a short window it still has to
            // yield rather than print over the build pad.
            fitColumn(empireSummary);
        }

        const victoryProgress = document.getElementById('victoryProgress');
        if (victoryProgress) {
            // On a short window the column runs into the build pad. Income is the line
            // a commander acts on every turn; victory percentages are a status read and
            // have their own panel, so they yield first.
            const victoryRoom = viewportHeight - columnTop - bottomReserved - 12;
            if (columnCrowded || victoryRoom < 34) {
                setImportant(victoryProgress, 'display', 'none');
            } else {
                setImportant(victoryProgress, 'display', 'block');
                const victoryWidth = veryNarrow
                    ? Math.max(150, viewportWidth - 16)
                    : Math.min(560 * scale, viewportWidth - turnWidth - 24);
                setImportant(victoryProgress, 'width', px(Math.max(150, victoryWidth)));
                setImportant(victoryProgress, 'top', px(columnTop));
                setImportant(victoryProgress, 'left', '10px');
                victoryProgress.style.fontSize = `${clamp(12 * scale, 10, 13)}px`;
                if (fitColumn(victoryProgress)) {
                    columnTop += 2;
                }
            }
        }

        const statusColumnBottom = columnTop;
        const sectorTop = Math.max(topReserved, statusColumnBottom);
        if (sectorDisplay) {
            const sectorMaxWidth = veryNarrow ? Math.max(132, viewportWidth * 0.48) : 300;
            const sectorMinWidth = Math.min(veryNarrow ? 150 : 190, sectorMaxWidth);
            const sectorWidth = clamp(240 * scale, sectorMinWidth, sectorMaxWidth);
            // Below a usable height this panel cannot be shown without printing over
            // the build pad. The Build tab still names the selected sector, so hiding
            // it costs the player nothing they cannot see elsewhere.
            const sectorRoom = viewportHeight - sectorTop - bottomReserved - 12;
            const sectorMaxHeight = Math.max(64, sectorRoom);
            setImportant(sectorDisplay, 'display', (shortLandscape || sectorRoom < 90) ? 'none' : 'block');
            setImportant(sectorDisplay, 'top', px(sectorTop));
            setImportant(sectorDisplay, 'left', px(10));
            setImportant(sectorDisplay, 'width', px(sectorWidth));
            setImportant(sectorDisplay, 'max-height', px(sectorMaxHeight));
            setImportant(sectorDisplay, 'overflow-y', 'auto');
            sectorDisplay.style.fontSize = `${clamp(12 * scale, 10.5, 13)}px`;
        }

        if (galaxyViewport) {
            const tacticalLeft = shortLandscape || veryNarrow
                ? 0
                : Math.min(viewportWidth * 0.36, 10 + clamp(240 * scale, 190, 300) + 22);
            setImportant(galaxyViewport, 'left', px(tacticalLeft));
            setImportant(galaxyViewport, 'right', '0');
            setImportant(galaxyViewport, 'top', '0');
            setImportant(galaxyViewport, 'bottom', '0');

            // Tell the 3D view which parts of its own canvas the HUD covers, so a
            // focused sector is framed in the clear band instead of behind the build
            // pad or the minimap. Insets are relative to the viewport's own box.
            const safeArea = stackBottomPanels
                ? { left: 0, right: 0, top: topReserved, bottom: bottomReserved }
                : {
                    // A collapsed panel occludes nothing, so it must not reserve anything.
                    // This is what makes collapsing actually give the map the space back
                    // rather than just hiding a panel over a still-shrunken camera frame.
                    left: controlPadCollapsed ? 0 : Math.max(0, controlWidth - tacticalLeft),
                    right: hideMinimap ? 0 : minimapWidth,
                    top: Math.max(statusColumnBottom, turnHeight + 8),
                    bottom: chatHeight + measuredControlHeight
                };
            const applySafeArea = () => window.Galaxy3D?.setSafeArea?.(safeArea);
            applySafeArea();
            // galaxy3d.js is an ES module, so on first paint it may not have registered
            // yet; retry once the module announces itself.
            document.addEventListener('galaxy3d-ready', applySafeArea, { once: true });
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
            // Must clear the whole left status column and the turn clock on the right,
            // otherwise "GALAXY MAP" is printed straight through the victory line.
            const needLeft = veryNarrow ? 84 : Math.max(330 * scale, controlWidth + 16, columnRight + 16);
            // Right side holds the turn clock AND the utility buttons parked beside it.
            const rightClear = veryNarrow ? 84 : turnWidth + 10 + utilityWidth + 16;
            // Decorative: drop it rather than let it print over the status column. The
            // test is against the clearance actually required, not a capped version of
            // it, or the title just slides back under the panels it was dodging.
            const titleRoom = viewportWidth - needLeft - rightClear;
            const leftClear = needLeft;
            // Phone widths need every row for the status column; the title is a label,
            // not information, so it is the first thing to go.
            setImportant(viewTitle, 'display',
                (titleIsDefault || shortLandscape || veryNarrow || titleRoom < 150) ? 'none' : 'block');
            setImportant(viewTitle, 'left', px(leftClear));
            setImportant(viewTitle, 'right', px(rightClear));
            // Sit clear of the connection bar when that bar shares the top row; on a
            // short window the two bands were only five pixels apart.
            setImportant(viewTitle, 'top', px(veryNarrow
                ? Math.max(126, turnHeight + 78)
                : Math.max(50 * scale, inlineInfoBottom + 6)));
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
        currentTitle = label || DEFAULT_TITLE;
        titleIsDefault = currentTitle === DEFAULT_TITLE;
        const viewTitle = document.getElementById('viewTitle');
        if (viewTitle) {
            viewTitle.textContent = currentTitle;
        }
        document.title = browserTitle || `${currentTitle} - Game of Worlds`;
        applyResponsiveLayout();
    }

    function restoreTitle() {
        // Human-facing sector numbers are decimal everywhere; only the wire uses hex.
        const selectedSector = Number(window.GalaxyMap?.getSelectedSector?.());
        if (Number.isFinite(selectedSector) && selectedSector > 0) {
            setTitle(`Sector ${selectedSector}`, `Sector ${selectedSector} - Game of Worlds`);
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

    /**
     * Wire one collapsible HUD panel. The panel itself is hidden by applyResponsiveLayout
     * reading the body class, not here — that keeps a single place deciding geometry, and
     * it is why collapsing also shrinks the 3D view's safe area instead of merely hiding a
     * box over an unchanged camera frame.
     *
     * The choice is remembered per browser. A player who wants the map big wants it big
     * every session, and re-hiding the same panel every login is the kind of small tax
     * that makes a UI feel like it is not listening.
     */
    function wirePanelToggle({ buttonId, bodyClass, storageKey, showLabel, hideLabel, showTitle, hideTitle }) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        let collapsed = false;
        try { collapsed = localStorage.getItem(storageKey) === 'hidden'; } catch (_) {}
        const apply = () => {
            document.body.classList.toggle(bodyClass, collapsed);
            button.textContent = collapsed ? showLabel : hideLabel;
            // aria-pressed describes the toggle's state, not the panel's: pressed means
            // "this control is currently suppressing its panel".
            button.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
            button.title = collapsed ? showTitle : hideTitle;
            applyResponsiveLayout();
        };
        button.addEventListener('click', () => {
            collapsed = !collapsed;
            try { localStorage.setItem(storageKey, collapsed ? 'hidden' : 'shown'); } catch (_) {}
            apply();
        });
        apply();
    }

    function wirePanelToggles() {
        wirePanelToggle({
            buttonId: 'controlPadToggle',
            bodyClass: 'controlpad-collapsed',
            storageKey: 'gow-controlpad',
            hideLabel: 'Hide panel',
            showLabel: 'Show panel',
            hideTitle: 'Hide the command panel and enlarge the map',
            showTitle: 'Show the command panel'
        });
        wirePanelToggle({
            buttonId: 'minimapToggle',
            bodyClass: 'minimap-collapsed',
            storageKey: 'gow-minimap',
            hideLabel: 'Hide minimap',
            showLabel: 'Show minimap',
            hideTitle: 'Hide the minimap and enlarge the map',
            showTitle: 'Show the minimap'
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        applyResponsiveLayout();
        wirePanelToggles();
        setTitle('Galaxy Map');
        initializeAudioButton();
    });

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(applyResponsiveLayout, 80);
    });
})();
