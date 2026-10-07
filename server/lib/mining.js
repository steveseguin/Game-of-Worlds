const { gameTables } = require('./game-tables');

const HAULER_TYPE = 10;
const CARGO_CAPACITY = 100;

// Richness changes the cargo mix, not hold size. Cargo is never research or
// passive income and receives no income multiplier.
function cargoFor(sector) {
    const metalWeight = Math.max(1, Number(sector.metalbonus) || 100) * 0.6;
    const crystalWeight = Math.max(1, Number(sector.crystalbonus) || 100) * 0.4;
    const metal = Math.round(CARGO_CAPACITY * metalWeight / (metalWeight + crystalWeight));
    return { metal, crystal: CARGO_CAPACITY - metal };
}

function cargoAction(ship, sector, contested = false) {
    if (!sector || contested || Number(ship.type) !== HAULER_TYPE) return 'holding';
    const cargo = Number(ship.cargo_metal || 0) + Number(ship.cargo_crystal || 0);
    if (cargo > 0) {
        return Number(sector.owner) === Number(ship.owner) && Number(sector.type) >= 6 && Number(sector.type) <= 10
            ? 'unloading' : 'loaded';
    }
    return !Number(sector.owner) && Number(sector.type) >= 6 && Number(sector.type) <= 9 ? 'loading' : 'idle';
}

// Runs after combat. Each hold is updated once per turn. Unloading clears the
// hold and credits its owner in ONE guarded SQL statement, including on retry.
async function processMiningTurn(query, gameId, turn, notify = () => {}) {
    const tables = gameTables(gameId);
    const ships = await query(`SELECT * FROM ${tables.ships}`);
    const haulers = ships.filter(ship => Number(ship.type) === HAULER_TYPE && Number(ship.last_mining_turn || 0) < turn);
    if (!haulers.length) return;
    const sectors = new Map((await query(`SELECT * FROM ${tables.map}`)).map(sector => [Number(sector.sectorid), sector]));
    const sectorOwners = new Map();
    const contestedSectors = new Set();
    for (const ship of ships) {
        const id = Number(ship.sectorid);
        const owner = Number(ship.owner);
        if (sectorOwners.has(id) && sectorOwners.get(id) !== owner) contestedSectors.add(id);
        else sectorOwners.set(id, owner);
    }
    for (const ship of haulers) {
        const sector = sectors.get(Number(ship.sectorid));
        const contested = contestedSectors.has(Number(ship.sectorid));
        const action = cargoAction(ship, sector, contested);
        if (action === 'loading') {
            const cargo = cargoFor(sector);
            const result = await query(
                `UPDATE ${tables.ships} s JOIN ${tables.map} m ON m.sectorid = s.sectorid
                 SET s.cargo_metal = ?, s.cargo_crystal = ?, s.last_mining_turn = ?
                 WHERE s.id = ? AND s.owner = ? AND s.type = 10 AND s.sectorid = ? AND s.last_mining_turn < ?
                 AND s.cargo_metal = 0 AND s.cargo_crystal = 0 AND (m.owner IS NULL OR m.owner = 0) AND m.type BETWEEN 6 AND 9`,
                [cargo.metal, cargo.crystal, turn, ship.id, ship.owner, ship.sectorid, turn]);
            if (result.affectedRows) notify(ship.owner, `Mining Hauler loaded ${cargo.metal} metal and ${cargo.crystal} crystal in sector ${ship.sectorid}. Return to an owned planet; cargo unloads at turn end.`);
        } else if (action === 'unloading') {
            const metal = Number(ship.cargo_metal) || 0;
            const crystal = Number(ship.cargo_crystal) || 0;
            const result = await query(
                `UPDATE ${tables.ships} s JOIN ${tables.players} p ON p.userid = s.owner JOIN ${tables.map} m ON m.sectorid = s.sectorid
                 SET p.metal = p.metal + ?, p.crystal = p.crystal + ?, s.cargo_metal = 0, s.cargo_crystal = 0, s.last_mining_turn = ?
                 WHERE s.id = ? AND s.owner = ? AND s.type = 10 AND s.sectorid = ? AND s.last_mining_turn < ?
                 AND s.cargo_metal = ? AND s.cargo_crystal = ? AND m.owner = s.owner AND m.type BETWEEN 6 AND 10`,
                [metal, crystal, turn, ship.id, ship.owner, ship.sectorid, turn, metal, crystal]);
            if (result.affectedRows) notify(ship.owner, `Cargo delivered in sector ${ship.sectorid}: +${metal} metal, +${crystal} crystal. Hauler ready for another expedition.`);
        }
    }
}

module.exports = { HAULER_TYPE, CARGO_CAPACITY, cargoFor, cargoAction, processMiningTurn };
