/**
 * Keeps construction controls aligned with the server's instant-build rules.
 * The server remains authoritative; this layer prevents predictable rejected
 * clicks and explains why an action is unavailable.
 */
const BuildSystem = (() => {
    const BUILDING_COSTS = {
        0: { metal: 50, crystal: 20 },
        1: { metal: 40, crystal: 30 },
        2: { metal: 60, crystal: 40 },
        3: { metal: 100, crystal: 50 },
        4: { metal: 80, crystal: 60 },
        5: { metal: 200, crystal: 150 }
    };
    const BUILDING_SLOTS = { 1: 1, 6: 2, 7: 3, 8: 4, 9: 5, 10: 6 };
    const FALLBACK_SHIP_COSTS = {
        1: { metal: 430, crystal: 0, shipyard: 0 },
        2: { metal: 780, crystal: 0, shipyard: 1 },
        3: { metal: 200, crystal: 0, shipyard: 0 },
        4: { metal: 980, crystal: 120, shipyard: 1 },
        5: { metal: 1650, crystal: 220, shipyard: 2 },
        6: { metal: 1000, crystal: 0, shipyard: 0 },
        7: { metal: 3200, crystal: 450, shipyard: 3 },
        8: { metal: 1950, crystal: 133, shipyard: 2 },
        9: { metal: 3000, crystal: 80, shipyard: 3 }
    };
    let initialized = false;

    function initialize() {
        if (initialized) return;
        initialized = true;
        document.querySelectorAll('[data-building-id]').forEach(button => {
            button.addEventListener('click', () => buyBuilding(Number(button.dataset.buildingId)));
        });
        document.querySelectorAll('.ship-button[data-ship-id]').forEach(button => {
            button.addEventListener('click', () => buyShip(Number(button.dataset.shipId)));
        });
        refresh();
    }

    function buildingCounts(buildings) {
        const counts = [0, 0, 0, 0, 0, 0];
        if (Array.isArray(buildings)) {
            buildings.forEach(item => {
                const type = Number(item?.type);
                if (type >= 0 && type <= 5) counts[type] += Number(item?.count) || 1;
            });
        } else if (buildings && typeof buildings === 'object') {
            const names = ['metalExtractor', 'crystalRefinery', 'researchAcademy', 'spaceport', 'orbitalTurret', 'warpgate'];
            names.forEach((name, type) => { counts[type] = Number(buildings[name]) || 0; });
        }
        return counts;
    }

    function setAvailability(button, enabled, reason) {
        if (!button) return;
        button.disabled = !enabled;
        button.classList.toggle('disabled', !enabled);
        if (reason) button.title = reason;
        else button.removeAttribute('title');
    }

    function hasResources(resources, cost) {
        return Number(resources?.metal) >= Number(cost?.metal || 0)
            && Number(resources?.crystal) >= Number(cost?.crystal || 0);
    }

    function refresh() {
        const sector = window.GAME_STATE?.selectedSectorData || (typeof GAME_STATE !== 'undefined' ? GAME_STATE.selectedSectorData : null);
        const player = window.GAME_STATE?.player || (typeof GAME_STATE !== 'undefined' ? GAME_STATE.player : {});
        const resources = player?.resources || {};
        const access = player?.raceAccess || {};
        const counts = buildingCounts(sector?.buildings);
        const myId = Number((document.cookie.match(/(?:^|; )userId=([^;]+)/) || [])[1]);
        const owned = Boolean(sector) && Number(sector.owner ?? sector.ownerid) === myId;
        const hasAuthoritativeLimit = sector?.buildingSlotLimit !== null
            && sector?.buildingSlotLimit !== undefined
            && Number.isFinite(Number(sector.buildingSlotLimit));
        const slotLimit = hasAuthoritativeLimit
            ? Number(sector.buildingSlotLimit)
            : (BUILDING_SLOTS[Number(sector?.type)] || 0);
        const usedSlots = counts.reduce((sum, count) => sum + count, 0);
        const techFx = window.TechSystem?.aggregateEffects?.(player?.techLevels || {}) || {};
        const battleFrozen = typeof turnFrozen !== 'undefined' && turnFrozen;

        for (let type = 0; type <= 5; type += 1) {
            const button = document.querySelector(`[data-building-id="${type}"]`);
            const count = document.getElementById(`bbb${type + 1}`);
            if (count) count.textContent = String(counts[type]);
            let reason = '';
            if (battleFrozen) reason = 'Orders are frozen during battle playback';
            else if (!sector) reason = 'Select one of your sectors first';
            else if (!owned) reason = 'You can only build in a sector you own';
            else if (!slotLimit) reason = 'This sector cannot support buildings';
            else if (usedSlots >= slotLimit) reason = `All ${slotLimit} building slots are occupied`;
            else if (type === 5 && Number(techFx.orbital || 0) < 1) reason = 'Needs Orbital Engineering Lv1';
            else if (!hasResources(resources, BUILDING_COSTS[type])) reason = 'Not enough resources';
            setAvailability(button, !reason, reason);
        }

        const allowed = Array.isArray(access.shipAccess) ? access.shipAccess : null;
        const shipCosts = access.shipCosts || FALLBACK_SHIP_COSTS;
        const yardLevel = Number(techFx.shipyards || 0);
        document.querySelectorAll('.ship-button[data-ship-id]').forEach(button => {
            const id = Number(button.dataset.shipId);
            const cost = shipCosts[id] || FALLBACK_SHIP_COSTS[id] || {};
            const yardNeeded = Number(cost.shipyard || 0);
            const label = button.querySelector('small');
            if (label) {
                label.textContent = `${cost.metal || 0}M${cost.crystal ? ` ${cost.crystal}C` : ''}${yardNeeded ? ` · Yard ${yardNeeded}` : ''}`;
            }
            let reason = '';
            if (battleFrozen) reason = 'Orders are frozen during battle playback';
            else if (!sector) reason = 'Select one of your sectors first';
            else if (!owned) reason = 'Ships can only be built in your own sector';
            else if (counts[3] < 1) reason = 'Build a Spaceport in this sector first';
            else if (allowed && !allowed.includes(id)) reason = `${access.raceName || 'Your race'} cannot build this hull`;
            else if (yardLevel < yardNeeded) reason = `Needs Military Shipyards Lv${yardNeeded}`;
            else if (!hasResources(resources, cost)) reason = 'Not enough resources';
            setAvailability(button, !reason, reason);
        });
    }

    return { initialize, refresh, updateBuildingUI: refresh, updateShipBuildingUI: refresh };
})();

document.addEventListener('DOMContentLoaded', BuildSystem.initialize);
window.BuildSystem = BuildSystem;
