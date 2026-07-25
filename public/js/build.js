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
    const SPACEPORT_TIERS = {
        1: { capacity: 12 },
        2: { capacity: 20, research: 1, metal: 350, crystal: 100 },
        3: { capacity: 32, research: 2, metal: 800, crystal: 250 },
        4: { capacity: 48, research: 3, metal: 1600, crystal: 500 }
    };
    const FALLBACK_SHIP_COSTS = {
        1: { metal: 430, crystal: 0, shipyard: 0, production: 3 },
        2: { metal: 780, crystal: 0, shipyard: 1, production: 5 },
        3: { metal: 200, crystal: 0, shipyard: 0, production: 1 },
        4: { metal: 980, crystal: 120, shipyard: 1, production: 8 },
        5: { metal: 1650, crystal: 220, shipyard: 2, production: 12 },
        6: { metal: 1000, crystal: 0, shipyard: 0, production: 7 },
        7: { metal: 3200, crystal: 450, shipyard: 3, production: 24 },
        8: { metal: 1950, crystal: 133, shipyard: 2, production: 7 },
        9: { metal: 3000, crystal: 80, shipyard: 3, production: 16 }
    };
    let initialized = false;

    function initialize() {
        if (initialized) return;
        initialized = true;
        document.querySelectorAll('[data-building-id]').forEach(button => {
            if (button.title) button.dataset.help = button.title;
            button.addEventListener('click', () => buyBuilding(Number(button.dataset.buildingId)));
        });
        document.querySelectorAll('.ship-button[data-ship-id]').forEach(button => {
            if (button.title) button.dataset.help = button.title;
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

    /**
     * Render a cost as coloured figures that match the treasury bar: warm = metal,
     * blue = crystal. The old "430M 120C" shorthand was never defined anywhere in the
     * UI, and neither were "Yard 2" or "7P".
     */
    function renderCost(label, { metal = 0, crystal = 0, shipyard = 0, production = 0, suffix = '' } = {}) {
        if (!label) return;
        label.textContent = '';
        const chip = (value, cls, title) => {
            const span = document.createElement('span');
            span.className = cls;
            span.textContent = Number(value).toLocaleString('en-US');
            span.title = title;
            label.append(span);
        };
        chip(metal, 'cost-metal', 'Metal');
        if (crystal) {
            label.append(document.createTextNode(' '));
            chip(crystal, 'cost-crystal', 'Crystal');
        }
        const notes = [];
        if (shipyard) notes.push(`Shipyards ${shipyard}`);
        if (production) notes.push(`${production} prod`);
        if (suffix) notes.push(suffix);
        if (notes.length) {
            const note = document.createElement('span');
            note.className = 'cost-note';
            note.textContent = ` · ${notes.join(' · ')}`;
            label.append(note);
        }
    }

    function setAvailability(button, enabled, reason) {
        if (!button) return;
        button.disabled = !enabled;
        button.classList.toggle('disabled', !enabled);
        const help = button.dataset.help || '';
        button.title = reason ? `${reason}. ${help}`.trim() : help;
    }

    function hasResources(resources, cost) {
        return Number(resources?.metal) >= Number(cost?.metal || 0)
            && Number(resources?.crystal) >= Number(cost?.crystal || 0);
    }

    /**
     * Answer "can I settle THIS world?" against the selected sector instead of
     * reciting four static rules and leaving the player to check them by hand.
     */
    function refreshColonizeChecklist(sector, player, techFx, myId, battleFrozen) {
        const list = document.getElementById('colonizeChecklist');
        const context = document.getElementById('colonizeSectorContext');
        const button = document.getElementById('colonizeBtn');
        if (!list) return;

        const mark = (name, state, text) => {
            const item = list.querySelector(`[data-req="${name}"]`);
            if (!item) return;
            item.classList.toggle('is-met', state === true);
            item.classList.toggle('is-blocked', state === false);
            const glyph = item.querySelector('.req-mark');
            // Written from here rather than via CSS ::before, which needed a font-size
            // hack that collapsed the mark's box and printed it over the label.
            if (glyph) glyph.textContent = state === true ? '✓' : state === false ? '✗' : '•';
            const label = item.querySelector('.req-text');
            if (label && text) label.textContent = text;
        };

        if (!sector) {
            if (context) context.textContent = 'Select a sector to check whether you can settle it.';
            ['planet', 'ship', 'terraform', 'unclaimed'].forEach(name => mark(name, null));
            setAvailability(button, false, 'Select a sector first');
            return;
        }

        const type = Number(sector.type);
        const isPlanet = type >= 6 && type <= 9;
        const owner = Number(sector.owner ?? sector.ownerid) || 0;
        const unclaimed = owner === 0;
        const colonyShips = Array.isArray(sector.ships)
            ? sector.ships.filter(s => Number(s.type) === 6 && Number(s.owner) === myId)
                .reduce((sum, s) => sum + (Number(s.count) || 1), 0)
            : 0;
        const required = Number(sector.terraformLevel) || 0;
        const have = Number(techFx.terraform || 0);
        // Terraform requirement is only legible once we have live intel on the sector.
        const terraformKnown = isPlanet && (unclaimed ? colonyShips > 0 || owner === myId : true);

        if (context) {
            context.textContent = isPlanet
                ? `Sector ${sector.id}: ${unclaimed ? 'unclaimed world' : (owner === myId ? 'already yours' : 'held by a rival')}.`
                : `Sector ${sector.id} has no planet to settle.`;
        }

        mark('planet', isPlanet, isPlanet
            ? 'The sector contains a planet'
            : 'The sector must contain a planet');
        mark('ship', colonyShips > 0, colonyShips > 0
            ? `Colony Ship in position (${colonyShips})`
            : 'A Colony Ship must be in the sector');
        mark('terraform', terraformKnown ? have >= required : null, terraformKnown
            ? (have >= required
                ? `Terraforming ${have} meets the requirement of ${required}`
                : `Needs Terraforming ${required} — you have ${have}`)
            : "Your Terraforming must meet the world's requirement");
        mark('unclaimed', unclaimed, unclaimed
            ? 'Nobody owns this sector'
            : 'Nobody else can already own it');

        let reason = '';
        if (battleFrozen) reason = 'Orders are frozen during battle playback';
        else if (!isPlanet) reason = 'There is no planet here to settle';
        else if (!unclaimed) reason = owner === myId ? 'You already own this world' : 'A rival holds this world';
        else if (colonyShips < 1) reason = 'Move a Colony Ship here first';
        else if (have < required) reason = `Needs Terraforming ${required}`;
        setAvailability(button, !reason, reason);
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
        const spaceport = Array.isArray(sector?.buildings) ? sector.buildings.find(item => Number(item?.type) === 3) : null;
        const spaceportLevel = spaceport ? Math.max(1, Number(spaceport.level) || 1) : 0;
        const portTier = SPACEPORT_TIERS[spaceportLevel] || null;
        const activeTurn = Number(typeof currentTurnNumber !== 'undefined' ? currentTurnNumber : 0);
        const productionUsed = spaceport && Number(spaceport.production_turn) === activeTurn ? Math.max(0, Number(spaceport.production_used) || 0) : 0;
        const productionRemaining = portTier ? Math.max(0, portTier.capacity - productionUsed) : 0;
        const portStatus = document.getElementById('spaceportProductionStatus');
        if (portStatus) portStatus.textContent = portTier
            ? `Spaceport ${spaceportLevel}: ${productionRemaining}/${portTier.capacity} production available this turn`
            : 'Build a Spaceport to produce ships locally.';

        for (let type = 0; type <= 5; type += 1) {
            const button = document.querySelector(`[data-building-id="${type}"]`);
            const count = document.getElementById(`bbb${type + 1}`);
            // A bare trailing number read as either "level 1" or "building #1". Say
            // which: these are counts, so use a multiplier, and hide it at zero rather
            // than labelling every unbuilt structure with a "0".
            if (count) count.textContent = counts[type] > 0 ? `×${counts[type]}` : '';
            let reason = '';
            if (battleFrozen) reason = 'Orders are frozen during battle playback';
            else if (!sector) reason = 'Select one of your sectors first';
            else if (!owned) reason = 'You can only build in a sector you own';
            else if (!slotLimit) reason = 'This sector cannot support buildings';
            else if (type === 5 && counts[type] > 0) reason = 'This sector already has a Warp Gate';
            else if (type === 3 && spaceportLevel >= 4) reason = 'This Spaceport is already at maximum level';
            else if (type === 3 && spaceportLevel > 0 && Number(techFx.shipyards || 0) < spaceportLevel) reason = `Upgrade requires Military Shipyards Lv${spaceportLevel}`;
            else if (usedSlots >= slotLimit && !(type === 3 && spaceportLevel > 0)) reason = `All ${slotLimit} building slots are occupied`;
            else if (type === 5 && Number(techFx.orbital || 0) < 1) reason = 'Needs Orbital Engineering Lv1';
            else if (type === 3 && spaceportLevel > 0 && !hasResources(resources, SPACEPORT_TIERS[spaceportLevel + 1])) reason = 'Not enough resources for this upgrade';
            else if (!hasResources(resources, BUILDING_COSTS[type])) reason = 'Not enough resources';
            setAvailability(button, !reason, reason);
            if (type === 3 && button) {
                const costLabel = button.querySelector('small');
                // The spaceport is the one structure with tiers rather than a count, so
                // it says "Lv N" where the others say "×N".
                if (spaceportLevel > 0 && spaceportLevel < 4) {
                    const next = SPACEPORT_TIERS[spaceportLevel + 1];
                    button.childNodes[0].textContent = `🚀 Upgrade Spaceport to Lv ${spaceportLevel + 1} `;
                    if (count) count.textContent = '';
                    renderCost(costLabel, {
                        metal: next.metal,
                        crystal: next.crystal,
                        shipyard: next.research,
                        suffix: `${next.capacity} prod/turn`
                    });
                } else if (spaceportLevel >= 4) {
                    button.childNodes[0].textContent = '🚀 Spaceport Lv 4 ';
                    if (count) count.textContent = '';
                    if (costLabel) costLabel.textContent = 'Maximum tier · 48 prod/turn';
                } else {
                    button.childNodes[0].textContent = '🚀 Spaceport ';
                    if (count) count.textContent = '';
                    renderCost(costLabel, { metal: 100, crystal: 50, suffix: '12 prod/turn' });
                }
            }
        }

        refreshColonizeChecklist(sector, player, techFx, myId, battleFrozen);

        const allowed = Array.isArray(access.shipAccess) ? access.shipAccess : null;
        const shipCosts = access.shipCosts || FALLBACK_SHIP_COSTS;
        const yardLevel = Number(techFx.shipyards || 0);
        document.querySelectorAll('.ship-button[data-ship-id]').forEach(button => {
            const id = Number(button.dataset.shipId);
            const cost = shipCosts[id] || FALLBACK_SHIP_COSTS[id] || {};
            const yardNeeded = Number(cost.shipyard || 0);
            const productionNeeded = Math.max(1, Number(cost.production) || 1);
            renderCost(button.querySelector('small'), {
                metal: cost.metal || 0,
                crystal: cost.crystal || 0,
                shipyard: yardNeeded,
                production: productionNeeded
            });
            let reason = '';
            if (battleFrozen) reason = 'Orders are frozen during battle playback';
            else if (!sector) reason = 'Select one of your sectors first';
            else if (!owned) reason = 'Ships can only be built in your own sector';
            else if (counts[3] < 1) reason = 'Build a Spaceport in this sector first';
            else if (allowed && !allowed.includes(id)) reason = `${access.raceName || 'Your race'} cannot build this hull`;
            else if (yardLevel < yardNeeded) reason = `Needs Military Shipyards Lv${yardNeeded}`;
            else if (spaceportLevel < yardNeeded + 1) reason = `Needs local Spaceport ${yardNeeded + 1}`;
            else if (productionRemaining < productionNeeded) reason = `Needs ${productionNeeded} production; ${productionRemaining} remains this turn`;
            else if (!hasResources(resources, cost)) reason = 'Not enough resources';
            setAvailability(button, !reason, reason);
        });
    }

    return { initialize, refresh, updateBuildingUI: refresh, updateShipBuildingUI: refresh };
})();

document.addEventListener('DOMContentLoaded', BuildSystem.initialize);
window.BuildSystem = BuildSystem;
