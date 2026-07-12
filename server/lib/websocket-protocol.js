const CLIENT_COMMANDS = Object.freeze([
    'start', 'creategame', 'gamelist', 'currentgame', 'leavegame', 'addai',
    'changerace', 'surrender', 'colonize', 'buytech', 'techstate',
    'victoryprogress', 'probe', 'buyship', 'buybuilding', 'move', 'sector', 'moveoptions',
    'mmove', 'sendmmf', 'update', 'joingame', 'getunlockedraces',
    'standingorders', 'applyorders'
]);

const FROZEN_GAMEPLAY_COMMANDS = Object.freeze([
    'start', 'colonize', 'buytech', 'probe', 'buyship', 'buybuilding',
    'move', 'sendmmf', 'applyorders'
]);

const GAME_MESSAGE_PREFIXES = Object.freeze([
    'currentgame::', 'lobby::', 'startgame::', 'newturn::', 'turnclock::',
    'turnphase::', 'resources::', 'techstate::', 'empire::',
    'victoryprogress::', 'mapconfig::', 'mapstate::', 'sector::', 'sectorcontact::', 'sectorintel::',
    'probeonly:', 'mmoptions:', 'mmoptionsv2::', 'fleetmove::', 'battlepause::', 'battle::',
    'battle_summary::', 'gameover::', 'standingorders::state::',
    'standingorders::applied::', 'standingorders::error::', 'standingorders::noop'
]);

function formatTurnPhase(state, turn, phase = '') {
    const normalizedState = ['resolving', 'failed', 'idle'].includes(state) ? state : 'idle';
    const normalizedTurn = Number.isSafeInteger(Number(turn)) && Number(turn) > 0 ? Number(turn) : 1;
    const safePhase = String(phase || '').replace(/[:\r\n]/g, '').slice(0, 40);
    return `turnphase::${normalizedState}::${normalizedTurn}::${safePhase}`;
}

module.exports = {
    CLIENT_COMMANDS,
    FROZEN_GAMEPLAY_COMMANDS,
    GAME_MESSAGE_PREFIXES,
    formatTurnPhase
};
