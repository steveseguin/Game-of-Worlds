/** A close-up of confirmed sector intel, using the existing WebGL scene. */
(() => {
    const button = document.getElementById('inspectPlanetBtn');
    if (!button) return;
    const panel = document.createElement('section');
    panel.id = 'planetInspection';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Sector inspection');
    panel.innerHTML = '<div class="inspection-head"><h2 id="inspectionTitle"></h2><button type="button" id="exitPlanetInspection">Back to map</button></div><div class="inspection-detail" tabindex="0" role="region" aria-label="Sector survey details"><strong id="inspectionIntel"></strong><p id="inspectionFleet"></p><p id="inspectionPort"></p><p id="inspectionCapacity"></p><p id="inspectionTerraform"></p><div class="inspection-controls"><button type="button" data-orbit="-0.3" aria-label="Rotate view left">Rotate left</button><button type="button" data-orbit="0.3" aria-label="Rotate view right">Rotate right</button><button type="button" data-zoom="0.85" aria-label="Zoom in on sector">Zoom in</button><button type="button" data-zoom="1.18" aria-label="Zoom out from sector">Zoom out</button></div></div>';
    document.body.appendChild(panel);
    panel.querySelectorAll('[data-orbit], [data-zoom]').forEach(control=>control.addEventListener('click',()=>window.Galaxy3D?.adjustPlanetInspection?.(Number(control.dataset.orbit)||0,Number(control.dataset.zoom)||1)));
    let activeId = null;
    let lastData = null;
    const count = rows => rows.reduce((sum,item)=>sum+(Number(item.count)||1),0);
    const text = (id,value) => document.getElementById(id).textContent=value;
    function describe(data) {
        const known = !data.sensorContactOnly && !data.unexplored;
        const planet = data.type != null && Number(data.type) >= 6 && Number(data.type) <= 10;
        ['inspectionPort', 'inspectionCapacity', 'inspectionTerraform'].forEach(id => { document.getElementById(id).hidden = !planet; });
        const buildings = Array.isArray(data.buildings) ? data.buildings : [];
        const ships = Array.isArray(data.ships) ? data.ships : [];
        const port = buildings.find(b=>Number(b.type)===3);
        const defense = count(buildings.filter(b=>Number(b.type)===4));
        text('inspectionTitle', `${data.chartName || 'Sector ' + Number(data.id)}`);
        text('inspectionIntel', data.unexplored ? 'Uncharted sector — terrain and hazards are unknown' : data.intelMemory ? 'Dated probe report — orbital positions are illustrative' : known ? 'Live survey — orbital positions are illustrative' : 'Sensor contact — probe for a full survey');
        text('inspectionFleet', known ? planet ? `${count(ships)} ships in orbit · ${defense} orbital defenses` : `${count(ships)} ships in this sector` : 'Fleet composition and defenses are not surveyed.');
        // Ship construction resolves immediately; do not invent a build queue.
        const used = port && Number(port.production_turn) === Number(typeof currentTurnNumber !== 'undefined' ? currentTurnNumber : 0) ? Number(port.production_used)||0 : 0;
        const capacity = port ? [0,12,20,32,48][Math.min(4,Number(port.level)||1)] : 0;
        text('inspectionPort', !known ? 'Spaceport status unknown.' : port ? `Spaceport level ${Number(port.level)||1} · ${Math.max(0,capacity-used)}/${capacity} production free this turn. Ships launch immediately when built.` : 'No Spaceport in this survey.');
        text('inspectionCapacity', known && data.buildingSlotLimit != null ? `${Math.max(0,Number(data.buildingSlotLimit)-count(buildings))} of ${data.buildingSlotLimit} building slots free` : 'Building capacity requires a full survey.');
        text('inspectionTerraform', data.terraformLevel == null ? 'Terraforming requirement unknown.' : `Terraforming requirement: ${data.terraformLevel}`);
    }
    function close() {
        if (activeId === null) return;
        window.Galaxy3D?.exitPlanetInspection?.();
        activeId=null;lastData=null;panel.hidden=true;
        document.body.classList.remove('planet-inspecting');
        window.dispatchEvent(new Event('resize'));
        const returnTarget = button.getClientRects().length ? button : document.getElementById('nextTurnBtn');
        if (returnTarget === button) document.getElementById('sectordisplay').scrollTop = 0;
        returnTarget?.focus({preventScroll:true});
    }
    button.addEventListener('click',()=>{
        const data=window.SectorPreview?.getSelected() || window.GAME_STATE?.selectedSectorData;
        if (!data || !window.Galaxy3D?.inspectPlanet?.(data)) return;
        activeId=Number(data.id);lastData=data;describe(data);
        document.body.classList.add('planet-inspecting');panel.hidden=false;
        window.dispatchEvent(new Event('resize'));
        document.getElementById('exitPlanetInspection').focus();
    });
    document.getElementById('exitPlanetInspection').addEventListener('click',close);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&activeId!==null){event.preventDefault();close();}});
    setInterval(()=>{
        const data=window.SectorPreview?.getSelected() || window.GAME_STATE?.selectedSectorData;
        button.hidden=false;
        button.disabled=!(data && window.Galaxy3D?.isReady?.());
        if(activeId!==null){
            if(Number(data?.id)!==activeId){close();return;}
            if(data!==lastData){lastData=data;describe(data);window.Galaxy3D?.inspectPlanet?.(data);}
        }
    },500);
})();
