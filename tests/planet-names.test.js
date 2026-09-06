const test = require('node:test');
const assert = require('node:assert/strict');
const names = require('../server/lib/sector-names');
const server = require('../server/server');

test('planet catalog names are stable, distinct and preserve stored names', () => {
    const defaults = Array.from({length:100}, (_,i) => names.nameForSector(12,{sectorid:i+1,type:8}));
    assert.equal(new Set(defaults).size,100);
    assert.deepEqual(defaults,Array.from({length:100},(_,i)=>names.planetDefaultName(12,i+1)));
    assert.equal(names.nameForSector(12,{sectorid:1,type:10,sectorname:'New Eden'}),'New Eden');
    assert.equal(names.nameForSector(12,{sectorid:1,type:0}),null);
});

test('planet names accept readable Unicode and reject markup, controls and wire delimiters', () => {
    assert.equal(names.normalizePlanetName('  Étoile  Nine  '),'Étoile Nine');
    assert.equal(names.normalizePlanetName("Ames's World"),"Ames's World");
    for (const value of ['', ' ', '<img src=x>', 'Alpha:1', 'X,Y', 'X\nY', 'X\u202eY', 'X'.repeat(49), null]) assert.equal(names.normalizePlanetName(value),null);
});

async function rename({owner=7,type=10,name='New Eden',affectedRows=1,stored=null,command}={}) {
    const writes=[],sent=[];
    server.setDatabase({query(sql,params,callback){
        if (typeof callback !== 'function') return;
        if (/^UPDATE map42 SET sectorname/.test(sql)) { writes.push({sql,params}); callback(null,{affectedRows}); }
        else callback(null, /^SELECT \* FROM map42 WHERE/.test(sql) ? [{sectorid:31,owner,type,sectorname:stored}] : []);
    }});
    await server.renamePlanet(command || `//renameplanet:1f:${encodeURIComponent(name)}`,{gameid:42,name:'7',sendUTF:message=>sent.push(message)});
    return {writes,result:JSON.parse(sent[0].slice('renameplanet::'.length))};
}
test('renaming persists a name with an atomic owner and planet-type guard',async()=>{
    const {writes,result}=await rename();
    assert.equal(result.ok,true);assert.equal(result.name,'New Eden');assert.equal(result.sectorId,31);
    assert.deepEqual(writes[0].params,['New Eden',31,7,10]);
    assert.match(writes[0].sql,/WHERE sectorid = \? AND owner = \? AND type = \?/);
});
test('rival planets, hazards, malformed names and ownership changes cannot be renamed',async()=>{
    for(const input of [{owner:8},{type:1},{type:0},{command:'//renameplanet:1f:%ZZ'},{name:'<script>'}]) {
        const {writes,result}=await rename(input);assert.equal(result.ok,false);assert.equal(writes.length,0);
    }
    assert.equal((await rename({affectedRows:0})).result.ok,false);
});
test('retrying a confirmed rename succeeds without another database write',async()=>{
    const {writes,result}=await rename({stored:'New Eden'});assert.equal(result.ok,true);assert.equal(writes.length,0);
});

test('renaming updates nearby charts without leaking changes to a distant observer',async()=>{
    const {MockDatabase}=require('../server/lib/mock-db');
    const db=new MockDatabase();server.setDatabase(db);
    const query=(sql,params=[])=>new Promise((resolve,reject)=>db.query(sql,params,(err,rows)=>err?reject(err):resolve(rows)));
    const gameid=97;
    server.gameState.activeGames[gameid]={mapSize:{width:14,height:8}};
    const make=name=>({name,gameid,sent:[],sendUTF(message){this.sent.push(message);}});
    const owner=make(7),near=make(8),far=make(9);
    server.gameState.clients.push(owner,near,far);
    try {
        await query('UPDATE map97 SET owner = ?, type = ? WHERE sectorid = ?',[7,10,1]);
        await query('UPDATE map97 SET owner = ? WHERE sectorid = ?',[8,2]);
        await query('UPDATE map97 SET owner = ? WHERE sectorid = ?',[9,112]);
        await query('INSERT IGNORE INTO explored_sectors97 (playerid, sectorid) VALUES (?, ?)',[9,1]);
        far.observedNamesGame=gameid;far.observedSectorNames=new Map([[1,'Old Haven']]);
        await server.renamePlanet('//renameplanet:1:New%20Haven',owner);
        for(let i=0;i<40 && !far.sent.some(m=>m.startsWith('mapstate::'));i++) await new Promise(resolve=>setImmediate(resolve));
        const nearby=near.sent.find(m=>m.startsWith('mapstate::'));
        const distant=far.sent.find(m=>m.startsWith('mapstate::'));
        assert.ok(nearby?.includes('New%20Haven'));
        assert.ok(distant?.includes('Old%20Haven'));
        assert.equal(far.sent.some(m=>m.includes('New Haven') || m.includes('New%20Haven')),false);
    } finally {
        for(const client of [owner,near,far]) server.gameState.clients.splice(server.gameState.clients.indexOf(client),1);
        delete server.gameState.activeGames[gameid];
    }
});
