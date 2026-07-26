const CLIENT_COMMANDS = Object.freeze([
    'start', 'creategame', 'gamelist', 'currentgame', 'leavegame', 'addai',
    'changerace', 'surrender', 'colonize', 'buytech', 'techstate',
    'victoryprogress', 'probe', 'buyship', 'buybuilding', 'move', 'sector', 'moveoptions',
    'mmove', 'sendmmf', 'update', 'joingame', 'getunlockedraces',
    'standingorders', 'applyorders', 'namesector'
]);

const FROZEN_GAMEPLAY_COMMANDS = Object.freeze([
    'start', 'colonize', 'buytech', 'probe', 'buyship', 'buybuilding',
    'move', 'sendmmf', 'applyorders'
]);

const GAME_MESSAGE_PREFIXES = Object.freeze([
    'currentgame::', 'lobby::', 'startgame::', 'newturn::', 'turnclock::',
    'turnphase::', 'turnready::', 'resources::', 'techstate::', 'empire::',
    'victoryprogress::', 'mapconfig::', 'mapstate::', 'sector::', 'sectorcontact::', 'sectorintel::',
    'probeonly:', 'mmoptions:', 'mmoptionsv2::', 'fleetmove::', 'battlepause::', 'battle::',
    'battle_summary::', 'gameover::', 'standingorders::state::',
    'standingorders::applied::', 'standingorders::error::', 'standingorders::noop',
    // Was missing, and the omission hid it from the contract test entirely - the guard
    // only checks prefixes it has been told about. The client had no handler, so an
    // elimination notice reached the player as the literal text
    // "systemalert::A rival empire has been wiped out of the galaxy."
    'systemalert::',
    // Offered to the one player who just swept a shoal, so they choose what goes on the
    // chart. Curated candidates only - see server/lib/sector-names.js for why the server
    // never accepts free text for a name that every player will see forever.
    'namechoice::',
    // The cluster reading, broadcast once at game start. Its own prefix rather than systemalert:: so
    // the feed icon is chosen by the SENDER instead of inferred from the prose - three of its four
    // lines mention mouths, shoals or a fleet and were being iconed as fleet movements.
    'advisory::'
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
