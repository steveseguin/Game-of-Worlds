/* The manifest contains only this commander's haulers. Map orders use the
   ordinary route planner, including its fuel and hazard confirmation. */
window.MiningConsole = (() => {
    let lastManifest = '';
    let returnPlan = null;
    function plotReturn(source) {
        const state = window.GAME_STATE;
        const worlds = Object.values(state?.mapSectors || {}).filter(sector => sector.live
            && sector.type >= 6 && sector.type <= 10
            && (['owned', 'colonized', 'homeworld'].includes(sector.status) || (sector.flags & 1)));
        const destination = worlds.find(sector => sector.id === state.player.homeworld) || worlds[0];
        if (!destination) {
            window.NotificationSystem?.notify?.('No return port', 'You need an owned planet to unload cargo.', 'warning', 5000);
            return;
        }
        returnPlan = { source, target: destination.id, requestedAt: Date.now() };
        window.requestMoveOptions(destination.id.toString(16));
    }
    function selectReturnFleet(plan) {
        const pending = returnPlan;
        returnPlan = null;
        if (!pending || Number(plan.target) !== pending.target || Date.now() - pending.requestedAt > 10000) return;
        const list = document.getElementById('shipsFromNearBy');
        if (!list) return;
        Array.from(list.options).forEach(option => {
            const [source, type] = option.value.split(':');
            option.selected = parseInt(source, 16) === pending.source && Number(type) === 10;
        });
        list.dispatchEvent(new Event('change'));
    }
    function update(payload) {
        const root = document.getElementById('miningManifest');
        if (!root) return;
        const ships = Array.isArray(payload.ships) ? payload.ships : [];
        const signature = JSON.stringify(ships);
        if (signature === lastManifest) return;
        lastManifest = signature;
        root.replaceChildren();
        document.getElementById('miningConsole').hidden = !ships.length;
        const total = ships.reduce((sum, ship) => sum + ship.metal + ship.crystal, 0);
        document.getElementById('miningCargoTotal').textContent = ships.length ? `${total}/${ships.length * payload.capacity} aboard` : '';
        if (!ships.length) {
            root.textContent = 'Build a Mining Hauler, then move it to an unclaimed planet.';
            return;
        }
        const groups = new Map();
        ships.forEach(ship => {
            const key = `${ship.sector}:${ship.status}`;
            if (!groups.has(key)) groups.set(key, { ...ship, count: 0, metal: 0, crystal: 0 });
            const group = groups.get(key);
            group.count++;
            group.metal += ship.metal;
            group.crystal += ship.crystal;
        });
        const labels = { loading: 'Loads at turn end', unloading: 'Unloads at turn end', loaded: 'Cargo ready to return', idle: 'Needs an unclaimed planet', holding: 'Operations blocked' };
        groups.forEach(group => {
            const row = document.createElement('div');
            row.className = 'mining-manifest-row';
            const locate = document.createElement('button');
            locate.type = 'button';
            locate.className = 'mining-locate';
            locate.textContent = `Sector ${group.sector}`;
            locate.setAttribute('aria-label', `Locate ${group.count} Mining Hauler${group.count === 1 ? '' : 's'} in sector ${group.sector}`);
            locate.onclick = () => {
                window.GalaxyMap?.selectSector?.(Number(group.sector));
                window.GalaxyMap?.focusSector?.(Number(group.sector));
            };
            const detail = document.createElement('span');
            detail.textContent = `${group.count} hauler${group.count === 1 ? '' : 's'} · ${group.metal} metal / ${group.crystal} crystal · ${labels[group.status] || 'Holding'}`;
            row.append(locate, detail);
            if (group.status === 'loaded') {
                const back = document.createElement('button');
                back.type = 'button';
                back.className = 'mining-locate mining-return';
                back.dataset.miningReturn = String(group.sector);
                back.textContent = 'Plot return';
                back.title = `Plan a return route for all your Mining Haulers in sector ${group.sector}. Review fuel and hazards before confirming.`;
                back.onclick = () => plotReturn(Number(group.sector));
                row.append(back);
            }
            root.append(row);
        });
    }
    return { update, selectReturnFleet };
})();
