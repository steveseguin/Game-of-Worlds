/**
 * combat-analytics.js - In-game live combat balance telemetry UI
 *
 * Renders per-ship combat metrics from server telemetry so balancing can
 * be evaluated from real matches without leaving the game screen.
 */
const CombatAnalytics = (function() {
    const REFRESH_INTERVAL_MS = 8000;

    const state = {
        initialized: false,
        pending: false,
        userId: null,
        gameId: null,
        intervalId: null
    };

    function initialize() {
        if (state.initialized) {
            return;
        }

        const panel = document.getElementById('analytics');
        if (!panel) {
            return;
        }

        state.initialized = true;
        state.userId = getUserId();

        const refreshButton = document.getElementById('combatAnalyticsRefresh');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => refreshTelemetry(true));
        }

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                refreshTelemetry(false);
            }
        });

        refreshTelemetry(true);
        state.intervalId = window.setInterval(() => {
            refreshTelemetry(false);
        }, REFRESH_INTERVAL_MS);
    }

    function getUserId() {
        const fromWindow = Number.parseInt(window.gameUserId, 10);
        if (Number.isFinite(fromWindow) && fromWindow > 0) {
            return fromWindow;
        }

        const fromStorage = Number.parseInt(localStorage.getItem('userId'), 10);
        if (Number.isFinite(fromStorage) && fromStorage > 0) {
            return fromStorage;
        }

        const fromCookie = Number.parseInt(getCookie('userId'), 10);
        if (Number.isFinite(fromCookie) && fromCookie > 0) {
            return fromCookie;
        }

        return null;
    }

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            return parts.pop().split(';').shift();
        }
        return null;
    }

    async function resolveGameId(forceLookup = false) {
        if (!forceLookup && Number.isFinite(state.gameId) && state.gameId > 0) {
            return state.gameId;
        }

        const fromWindow = Number.parseInt(window.currentGameId, 10);
        if (Number.isFinite(fromWindow) && fromWindow > 0) {
            state.gameId = fromWindow;
            return fromWindow;
        }

        if (!state.userId) {
            return null;
        }

        const response = await fetch(`/api/user/${state.userId}/current-game`, { cache: 'no-store' });
        if (!response.ok) {
            return null;
        }

        const payload = await response.json();
        const currentGameId = Number.parseInt(payload.currentGame, 10);
        if (!Number.isFinite(currentGameId) || currentGameId <= 0) {
            return null;
        }

        state.gameId = currentGameId;
        window.currentGameId = currentGameId;
        return currentGameId;
    }

    async function refreshTelemetry(forceLookup = false) {
        if (state.pending) {
            return;
        }

        state.pending = true;
        setStatus('Loading live combat telemetry...', 'idle');

        try {
            const gameId = await resolveGameId(forceLookup);
            if (!gameId) {
                setSummaryValues({ gameId: '-', battles: 0, updatedAt: '-' });
                renderPlayers([]);
                renderRecentBattles([]);
                setStatus('No active game telemetry available yet.', 'warn');
                return;
            }

            const response = await fetch(`/api/game/${gameId}/combat-telemetry`, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`Telemetry endpoint returned ${response.status}`);
            }

            const telemetry = await response.json();
            renderTelemetry(telemetry);
            setStatus('Telemetry synced from live battles.', 'good');
        } catch (error) {
            console.error('Combat analytics refresh failed:', error);
            setStatus('Telemetry unavailable right now. Will retry automatically.', 'error');
        } finally {
            state.pending = false;
        }
    }

    function renderTelemetry(telemetry) {
        const gameId = Number(telemetry && telemetry.gameId) || state.gameId || '-';
        const battles = Number(telemetry && telemetry.battles) || 0;
        const updatedAt = formatTimestamp(telemetry && telemetry.updatedAt);
        setSummaryValues({ gameId, battles, updatedAt });

        renderPlayers(Array.isArray(telemetry && telemetry.players) ? telemetry.players : []);
        renderRecentBattles(Array.isArray(telemetry && telemetry.recentBattles) ? telemetry.recentBattles : []);
    }

    function setSummaryValues({ gameId, battles, updatedAt }) {
        const gameIdEl = document.getElementById('combatAnalyticsGameId');
        const battlesEl = document.getElementById('combatAnalyticsBattleCount');
        const updatedAtEl = document.getElementById('combatAnalyticsUpdatedAt');

        if (gameIdEl) {
            gameIdEl.textContent = String(gameId);
        }
        if (battlesEl) {
            battlesEl.textContent = String(battles);
        }
        if (updatedAtEl) {
            updatedAtEl.textContent = updatedAt || '-';
        }
    }

    function renderPlayers(players) {
        const container = document.getElementById('combatAnalyticsPlayers');
        if (!container) {
            return;
        }

        if (!players || players.length === 0) {
            container.innerHTML = '<div class="analytics-player-card">No combat player metrics yet.</div>';
            return;
        }

        container.innerHTML = players.map(renderPlayerCard).join('');
    }

    function renderPlayerCard(player) {
        const playerId = Number(player.playerId) || '?';
        const raceName = escapeHtml(player.raceName || `Race ${player.raceId || '?'}`);
        const battles = Number(player.battles) || 0;
        const shipStats = Array.isArray(player.shipStats) ? player.shipStats : [];
        const sortedStats = shipStats
            .slice()
            .sort((a, b) => (Number(b.damage) || 0) - (Number(a.damage) || 0));
        const statRows = sortedStats.length > 0
            ? sortedStats.map(renderShipRow).join('')
            : '<tr><td colspan="7">No ship-level telemetry yet.</td></tr>';

        const orbital = player.orbitalTurret || {};
        const orbitalLine = `Orbital turrets: shots ${Number(orbital.shots) || 0}, hit ${(Number(orbital.hitRate) * 100 || 0).toFixed(0)}%, damage ${formatNumber(Number(orbital.damage) || 0)}, kills ${formatNumber(Number(orbital.kills) || 0)}`;

        return `
            <div class="analytics-player-card">
                <div class="analytics-player-title">
                    <strong>Player ${playerId}</strong>
                    <span>${raceName} • ${battles} battles</span>
                </div>
                <table class="analytics-ship-table">
                    <thead>
                        <tr>
                            <th>Ship</th>
                            <th>Deploy</th>
                            <th>Loss</th>
                            <th>Kills</th>
                            <th>Hit%</th>
                            <th>Dmg/Shot</th>
                            <th>K/L</th>
                        </tr>
                    </thead>
                    <tbody>${statRows}</tbody>
                </table>
                <div style="margin-top:6px;font-size:11px;color:#bdd5ff;">${escapeHtml(orbitalLine)}</div>
            </div>
        `;
    }

    function renderShipRow(stat) {
        const deployed = Number(stat.deployed) || 0;
        const losses = Number(stat.losses) || 0;
        const kills = Number(stat.kills) || 0;
        const hitRate = Number(stat.hitRate) || 0;
        const damagePerShot = Number(stat.damagePerShot) || 0;
        const killPerLoss = stat.killPerLoss === null || stat.killPerLoss === undefined
            ? (kills > 0 ? `${formatNumber(kills)}/0` : '0')
            : formatNumber(Number(stat.killPerLoss) || 0);
        const efficiencyClass = kills >= losses ? 'analytics-ship-positive' : 'analytics-ship-negative';

        return `
            <tr>
                <td>${escapeHtml(stat.shipName || `Ship ${stat.shipTypeId || '?'}`)}</td>
                <td>${deployed}</td>
                <td>${losses}</td>
                <td class="${efficiencyClass}">${formatNumber(kills)}</td>
                <td>${(hitRate * 100).toFixed(0)}%</td>
                <td>${formatNumber(damagePerShot)}</td>
                <td class="${efficiencyClass}">${killPerLoss}</td>
            </tr>
        `;
    }

    function renderRecentBattles(recentBattles) {
        const container = document.getElementById('combatAnalyticsRecent');
        if (!container) {
            return;
        }

        if (!recentBattles || recentBattles.length === 0) {
            container.innerHTML = '<div class="analytics-recent-item">No completed battles in this telemetry window yet.</div>';
            return;
        }

        const entries = recentBattles
            .slice(-8)
            .reverse()
            .map(entry => {
                const sector = entry && entry.sector ? escapeHtml(entry.sector) : '?';
                const winnerId = Number(entry && entry.winnerId) || '?';
                const attackerLosses = Number(entry && entry.attackerLosses) || 0;
                const defenderLosses = Number(entry && entry.defenderLosses) || 0;
                const attackerTop = entry && entry.attackerTopShip ? escapeHtml(entry.attackerTopShip.shipName) : 'n/a';
                const defenderTop = entry && entry.defenderTopShip ? escapeHtml(entry.defenderTopShip.shipName) : 'n/a';
                const time = formatTimestamp(entry && entry.timestamp);

                return `
                    <div class="analytics-recent-item">
                        <strong>Sector ${sector}</strong> • winner P${winnerId}<br>
                        Losses A:${attackerLosses} / D:${defenderLosses}<br>
                        Top ships A:${attackerTop} • D:${defenderTop}<br>
                        <span style="color:#a9c7f0;">${escapeHtml(time)}</span>
                    </div>
                `;
            });

        container.innerHTML = entries.join('');
    }

    function setStatus(message, kind = 'idle') {
        const statusEl = document.getElementById('combatAnalyticsStatus');
        if (!statusEl) {
            return;
        }

        statusEl.classList.remove(
            'analytics-status-idle',
            'analytics-status-good',
            'analytics-status-warn',
            'analytics-status-error'
        );
        statusEl.classList.add(`analytics-status-${kind}`);
        statusEl.textContent = message;
    }

    function formatTimestamp(value) {
        if (!value) {
            return '-';
        }

        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return '-';
        }

        return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function formatNumber(value) {
        if (!Number.isFinite(value)) {
            return '0';
        }
        return value.toFixed(value >= 10 ? 1 : 2).replace(/\.00$/, '');
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, char => {
            switch (char) {
                case '&': return '&amp;';
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '"': return '&quot;';
                case "'": return '&#39;';
                default: return char;
            }
        });
    }

    return {
        initialize,
        refreshTelemetry
    };
})();

window.CombatAnalytics = CombatAnalytics;
