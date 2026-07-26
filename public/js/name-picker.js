/**
 * name-picker.js - the one place a player writes on the shared map.
 *
 * WHY THIS EXISTS. Every named place in this galaxy is named after whoever first survived it
 * (lore/18-naming-the-dark.md), and the server has been generating those names on its own since
 * the sweep feature shipped. That worked and it made the player a spectator of their own chart:
 * they paid for the crossing and somebody else wrote the label. This gives them the pen.
 *
 * The name is permanent and survives conquest, so a player who takes this sector later inherits
 * what was chosen here. That is the whole point - it is the only object in the game that carries
 * a stranger's decision forever.
 *
 * PROTOCOL. The server sends `namechoice::<json>` with `{sector, chosen, candidates, turn}` to
 * the one player entitled to name the place. The reply is `//namesector:<sectorHex>:<index>` -
 * an index into the candidate list, never a name. Nothing typed here can reach another player's
 * map, which is why there is no text field and no profanity filter: there is nothing to filter.
 *
 * NOT A MODAL. The sector already has a name by the time this appears, so dismissing it is a
 * legitimate answer and must never cost anything. It sits above the HUD and gets out of the way.
 */
(function () {
    const PROMPT_ID = 'namePrompt';

    /** The sector currently being named, so a stale click cannot rename the wrong place. */
    let pending = null;

    function el(id) {
        return document.getElementById(id);
    }

    function hide() {
        const prompt = el(PROMPT_ID);
        if (prompt) prompt.style.display = 'none';
        pending = null;
    }

    /**
     * Hex, upper case, no prefix - the token every other sector command on the wire uses.
     * Sending a decimal id here would parse as a different sector, not fail.
     */
    function sectorToken(sector) {
        return Number(sector).toString(16).toUpperCase();
    }

    function optionStyle(active) {
        return 'background:' + (active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)')
            + ';border:1px solid rgba(255,255,255,0.10);border-radius:8px;'
            + 'color:' + (active ? '#e8ecff' : 'rgba(232,236,255,0.78)') + ';'
            + 'font-size:12px;padding:6px 11px;cursor:pointer;text-align:left;';
    }

    function send(index) {
        if (!pending) return;
        // sendGameCommand is connect.js's only exit to the socket, and it owns the two checks
        // worth having: the connection is open and authenticated, and orders are not frozen for
        // a battle or a turn resolution. Reaching past it to websocket.send would skip both and
        // lose the order silently. It reports failure, so leave the prompt up if it says no -
        // the player has a turn of grace and can click again.
        const send = window.sendGameCommand;
        if (typeof send !== 'function') return;
        if (send(`//namesector:${sectorToken(pending.sector)}:${index}`) === false) return;
        hide();
    }

    /**
     * Show the prompt. Called from connect.js on `namechoice::`.
     * Tolerates a malformed payload by doing nothing - a missed prompt costs the player a
     * cosmetic choice, whereas throwing here would land in the socket's message handler.
     */
    function offer(payload) {
        const prompt = el(PROMPT_ID);
        const options = el('namePromptOptions');
        const blurb = el('namePromptBlurb');
        if (!prompt || !options || !blurb) return;

        const sector = Number(payload && payload.sector);
        const candidates = (payload && payload.candidates) || [];
        if (!Number.isFinite(sector) || !Array.isArray(candidates) || candidates.length === 0) return;

        pending = { sector, chosen: payload.chosen };

        // Lead with the cost. A shoal is named after what it took to cross it, and the prompt
        // arrives at the exact moment the player learns the crossing was worth it - so the hull
        // count goes first and the housekeeping goes second. A clean sweep gets its own line
        // rather than "0 hulls", because nothing lost is a different thing, not a smaller one.
        const cost = Number(payload.cost);
        const paid = !Number.isFinite(cost) || cost <= 0
            ? `Sector ${sectorToken(sector)} is swept, and every hull came home.`
            : `${cost} hull${cost === 1 ? '' : 's'} did not arrive at ${sectorToken(sector)}. `
                + 'The shoal is swept. It is a road now and it will stay one.';
        blurb.textContent = `${paid} Whoever holds it after you will use the name you choose.`;

        options.innerHTML = '';
        candidates.forEach((candidate, index) => {
            const button = document.createElement('button');
            // textContent, not innerHTML. These strings come off the wire, and although the
            // server composes them from a fixed word list, the rule for wire data is the same
            // everywhere: it is text, it is never markup.
            button.textContent = candidate;
            button.setAttribute('style', optionStyle(candidate === payload.chosen));
            button.addEventListener('click', () => send(index));
            options.appendChild(button);
        });

        prompt.style.display = 'block';
    }

    function wire() {
        const close = el('namePromptClose');
        if (close) close.addEventListener('click', hide);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wire);
    } else {
        wire();
    }

    window.NamePicker = { offer, hide };
})();
