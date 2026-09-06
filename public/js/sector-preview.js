/** Selected destination: one cached still from the existing map, never another render loop. */
(() => {
    const el = id => document.getElementById(id);
    const image = el('sectorPreviewImage');
    if (!image) return;
    const kinds = ['Empty space', 'Asteroid belt', 'Black hole', 'Unstable star', 'Brown dwarf', 'Small moon', 'Micro planet', 'Small planet', 'Medium planet', 'Large planet', 'Homeworld'];
    let current = null, timer = null, revision = 0, pendingId = null, timeout = null;
    const dialog = document.createElement('dialog');
    dialog.id = 'planetNameDialog';
    dialog.setAttribute('aria-labelledby', 'planetNameTitle');
    dialog.innerHTML = '<form><h2 id="planetNameTitle">Name your planet</h2><label for="planetNameInput">Planet name</label><input id="planetNameInput" name="planetName" maxlength="48" required autocomplete="off" aria-describedby="planetNameHelp"><p id="planetNameHelp">Up to 48 letters, numbers, spaces, apostrophes, periods or hyphens.</p><p id="planetNameError" role="status"></p><div class="planet-name-actions"><button type="submit">Save name</button><button type="button" id="cancelPlanetName">Cancel</button></div></form>';
    document.body.appendChild(dialog);
    const save = dialog.querySelector('[type=submit]');
    function show(data) {
        if (!data) return;
        const old = current;
        current = data;
        const known = !data.unexplored && data.type != null;
        const name = data.chartName || `Sector ${data.id}`;
        el('sectorPreviewName').textContent = name;
        el('sectorPreviewKind').textContent = `Sector ${data.id} · ${known ? kinds[Number(data.type)] || 'Surveyed terrain' : 'Uncharted'}`;
        el('sectorPreviewNote').textContent = !known ? 'Terrain unknown until explored.' : data.intelMemory ? 'Last known terrain · conditions may have changed.' : 'Selected destination';
        el('sectorMoveShips').setAttribute('aria-label', `Move ships to ${name}, sector ${data.id}`);
        const playerId = Number(window.GAME_STATE?.player?.id || (document.cookie.match(/(?:^|; )userId=([^;]+)/)||[])[1]);
        el('renamePlanetBtn').hidden = !(known && data.type >= 6 && data.type <= 10 && Number(data.owner) === playerId && playerId > 0 && !data.intelMemory && !data.sensorContactOnly);
        if (Number(old?.id) !== Number(data.id) || old?.type !== data.type || Boolean(old?.unexplored) !== Boolean(data.unexplored)) {
            const version = ++revision;
            clearTimeout(timer);
            image.hidden = true;
            image.removeAttribute('src');
            if (known && Number(data.type) > 0) {
                image.src = Number(data.type) === 10 ? '/images/planet10.jpg' : `/images/type${Number(data.type)}.jpg`;
                image.hidden = false;
            }
            image.alt = known ? `${kinds[Number(data.type)] || 'Terrain'} in sector ${data.id}` : '';
            let attempts = 0;
            const capture = () => {
                if (version !== revision || !known) return;
                const snapshot = window.Galaxy3D?.sectorPreview?.(data.id);
                if (snapshot) { image.src = snapshot; image.hidden = false; }
                else if (++attempts < 20) timer = setTimeout(capture, 500);
            };
            timer = setTimeout(capture, 250);
        }
    }
    el('renamePlanetBtn').addEventListener('click', () => {
        pendingId = current.id;
        el('planetNameInput').value = current.chartName || '';
        el('planetNameError').textContent = '';
        save.disabled = false;
        dialog.showModal();
        el('planetNameInput').focus();
        el('planetNameInput').select();
    });
    el('cancelPlanetName').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { clearTimeout(timeout); pendingId = null; });
    dialog.querySelector('form').addEventListener('submit', event => {
        event.preventDefault();
        if (save.disabled || pendingId == null) return;
        const name = el('planetNameInput').value.trim();
        if (!/^[\p{L}\p{N}][\p{L}\p{N} .'’\-]{0,47}$/u.test(name)) {
            el('planetNameError').textContent = 'Enter a name using the characters listed above.';
            return;
        }
        if (window.sendGameCommand?.(`//renameplanet:${Number(pendingId).toString(16)}:${encodeURIComponent(name)}`) !== true) {
            el('planetNameError').textContent = 'Reconnect before saving your planet name.';
            return;
        }
        save.disabled = true;
        el('planetNameError').textContent = 'Saving…';
        timeout = setTimeout(() => { save.disabled = false; el('planetNameError').textContent = 'No confirmation yet. You can retry saving.'; }, 10000);
    });
    function renamed(result) {
        if (result.ok && Number(current?.id) === Number(result.sectorId)) {
            current.chartName = result.name;
            if (window.GAME_STATE?.selectedSectorData?.id === current.id) window.GAME_STATE.selectedSectorData.chartName = result.name;
            show(current);
        }
        if (Number(pendingId) !== Number(result.sectorId)) return;
        clearTimeout(timeout);
        save.disabled = false;
        if (result.ok) { dialog.close(); el('sectorPreviewNote').textContent = 'Planet name saved.'; }
        else el('planetNameError').textContent = result.error || 'Unable to save the name.';
    }
    window.SectorPreview = { show, renamed, getSelected: () => current };
})();
