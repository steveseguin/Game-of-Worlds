/**
 * avatar-notifications.js - the standing advisory instrument
 *
 * One message at a time from the player's race advisor, with up/down paging
 * through the history and a dismiss key.
 *
 * PRESENTATION. style.css owns the finished look of this panel on the game
 * screen: it seats the bubble in the right-hand instrument column, gives it the
 * riveted plate, the "STANDING ADVISORY" rail and the ADV-06 stencil, and hides
 * the companion avatar disc (which used to occlude the event panel behind it).
 * Every rule in addStyles() below is deliberately written at a LOWER
 * specificity than its counterpart there - single class, no #id - so it is a
 * base that agrees with the page rather than a second opinion fighting it. The
 * base matters when this module is used off the game screen and it matters when
 * you read the file: nothing here should have to be explained by a rule in
 * another file.
 *
 * THE ONE THING THIS FILE MEASURES. That rail is an absolutely positioned
 * ::before, so the space reserved for it is a padding-top constant, and a
 * constant is a bet on how tall 10px Russo One renders. When the bet is wrong
 * the first line of the advisory goes under the rail. syncRailClearance()
 * measures the rail that actually rendered and raises the reserved space if it
 * has outgrown the reservation - it never lowers it, so when the constant is
 * right (it is today) the panel is pixel-identical and the stylesheet stays in
 * charge.
 *
 * WHAT THE PANEL IS MADE OF NOW, and why.
 *
 *   - SEVERITY IS A STENCIL AND A ROLE. The four states used to differ only in
 *     text colour, which dies in greyscale and is exactly the wrong channel for
 *     a red-green CVD player on the info-vs-error pair. It now carries the same
 *     MSG / WRN / OK / ERR chip, in the same recessed socket, as the toast
 *     plates one panel away - and the same FOUR colour roles those plates use
 *     (steel / verdigris / amber / crimson). The pass before this one gave info
 *     and success the same bronze chip on the theory that the code was doing the
 *     work; pixel-sampling proved the chip was then carrying no colour
 *     information at all. Same owner, same language, four states, four hues.
 *   - THE ADVISOR HAS A FACE. This is the character channel, and the character
 *     used to be the words "TERRAN EMPIRE" in 9px grey mono, because style.css
 *     hides the companion portrait disc (rightly - it occluded the event panel).
 *     The painted race crest now sits in a recessed socket INSIDE the plate, at
 *     the left of the message row, where it cannot occlude anything.
 *   - THE FOOTER WELL IS LABELLED AT BOTH ENDS. It spans to the key so it reads
 *     as an instrument face, but with one advisory a single centre-dotted string
 *     left ~55% of it as empty black - a placeholder-looking field on the game's
 *     most persistent overlay. Race left, LOG timestamp right. A tick hatch ran
 *     between them for one revision and has been removed: it looked like a
 *     depletion gauge and nothing in an advisory depletes, so it was an
 *     instrument reading nothing on the overlay a player sees most.
 *   - NO PAGER FOR ONE MESSAGE. updateDisplay() disabled navUp at index 0 and
 *     navDown at the last index, so the state EVERY new player meets - one
 *     welcome message - rendered two dead keys. The first control row the game
 *     hands you should not look broken. Below two messages the arrows and the
 *     counter are not rendered at all.
 *   - EVERY MARK IS DRAWN. The arrows were text triangles and the dismiss was a
 *     13px &times; in a salmon that appears nowhere else in the palette; on a
 *     1080p screen it was four pixels of pink. All three keys now carry inline
 *     SVG whose colour is set on the SVG, so the size, weight and hue are this
 *     file's rather than the font's - and the page stylesheet's !important
 *     salmon has nothing left to colour.
 *   - THE CONTROL ROW HAS THREE ANCHORS AND ONE TOP EDGE. space-between across a
 *     364px panel with two occupants left a ~197px hole. The row is now [who is
 *     speaking] ... [count][keys]. Every control in it is pinned to one height
 *     constant and stretched to it: centring five controls of four different
 *     intrinsic heights lined them up on their middles and left three different
 *     top edges, 2px apart, which read as three kits rather than one bank.
 */

const AvatarNotifications = (function() {
    let container = null;
    let currentRaceId = 1; // Default to Terran
    let notifications = [];
    let currentIndex = 0;
    let maxNotifications = 50;
    let railSyncQueued = false;
    const WELCOME_STORAGE_KEY = 'gow-avatar-welcome-dismissed-v1';

    // Race avatar configurations (id matches server race IDs).
    //
    // THE PAINTED CREST, NOT THE VECTOR DISC. These pointed at ./images/*.svg -
    // glossy web-2.0 discs with specular sheens and per-race accent hues
    // (#00ffff, #32cd32, #ffd700) that belong to no palette this product has.
    // That is why the portrait was hidden on the game screen in the first place,
    // and hiding it is why the character channel shipped with no character.
    // public/images/ui/crests-512-*.png are the painted crests style.css already
    // stamps on the empire summary: same twelve factions, same bronze-and-steel
    // register as everything else in the HUD, already published, already inside
    // the art budget. The per-race `color` field went with the SVGs - it fed a
    // --race-color custom property that no rule has ever read.
    const raceAvatars = {
        1: { name: 'Terran Empire', asset: './images/ui/crests-512-01-terran.png' },
        2: { name: 'Silicon Collective', asset: './images/ui/crests-512-02-silicon.png' },
        3: { name: 'Zephyr Swarm', asset: './images/ui/crests-512-03-zephyr.png' },
        4: { name: 'Crystalline Entity', asset: './images/ui/crests-512-04-crystalline.png' },
        5: { name: 'Void Walkers', asset: './images/ui/crests-512-05-void-walkers.png' },
        6: { name: 'Mechanicus', asset: './images/ui/crests-512-06-mechanicus.png' },
        7: { name: 'Bioform Collective', asset: './images/ui/crests-512-07-bioform.png' },
        8: { name: 'Star Nomads', asset: './images/ui/crests-512-08-star-nomads.png' },
        9: { name: 'The Ancients', asset: './images/ui/crests-512-09-ancients.png' },
        10: { name: 'Quantum Entities', asset: './images/ui/crests-512-10-quantum.png' },
        11: { name: 'Titan Lords', asset: './images/ui/crests-512-11-titan-lords.png' },
        12: { name: 'Shadow Realm', asset: './images/ui/crests-512-12-shadow-realm.png' }
    };

    // Severity -> the stencil the toast plates already use, on the SAME four
    // roles. Success and info used to share the bronze tone "because they are
    // told apart by the CODE" - but a chip whose ink never changes carries no
    // colour information at all, and pixel-sampling the shipped build confirmed
    // it: the info chip and the success chip were #bb9143 and #bf9445. There are
    // four states, so there are four roles: steel says "a fact", verdigris says
    // "gained or secured", amber says "this wants an order", crimson says "lost".
    // The code still spells the kind, so the distinction survives greyscale on
    // its own; the hue is the second signal, never the only one.
    const SEVERITY = {
        info: { code: 'MSG', tone: '' },
        success: { code: 'OK', tone: 'is-success' },
        warning: { code: 'WRN', tone: 'is-warning' },
        error: { code: 'ERR', tone: 'is-error' }
    };

    // Drawn geometry, not typography. A 9px text triangle renders in whatever
    // fallback face the browser happens to have and a 13px multiplication sign is
    // a speck; these are the same mark at the same weight on every machine.
    //
    // ONE TRIANGLE, MIRRORED. Up and down used to be two separately authored
    // paths that were meant to be reflections of each other - which is a claim
    // about two strings that nothing checks, and a pair of paging keys is
    // exactly where a half-pixel of asymmetry shows. There is now one path; the
    // down key flips it with scaleY(-1), so the two are identical by
    // construction rather than by inspection.
    const GLYPH_ARROW = '<svg class="nav-mark" viewBox="0 0 12 8" aria-hidden="true" focusable="false">'
        + '<path d="M6 0.6 11.4 7.4 0.6 7.4Z" fill="currentColor"/></svg>';
    const GLYPH_ACK = '<svg class="nav-mark nav-mark--cross" viewBox="0 0 12 12" aria-hidden="true" focusable="false">'
        + '<path d="M2.6 2.6 9.4 9.4M9.4 2.6 2.6 9.4" fill="none" stroke="currentColor" '
        + 'stroke-width="2" stroke-linecap="square"/></svg>';

    // Render race art for the current advisor, seated in the recessed socket
    // every other instrument face in this HUD uses. One markup, two mounts: the
    // companion disc (hidden on the game screen) and the inline crest in the
    // advisory body itself, which is the one a player actually sees.
    function generateAvatar(raceId) {
        const race = raceAvatars[raceId] || raceAvatars[1];
        return `
            <span class="avatar-art-frame">
                <img src="${race.asset}" alt="${escapeHtml(race.name)}" loading="lazy">
            </span>
        `;
    }

    function initialize() {
        if (container) return;

        // Create main container
        container = document.createElement('div');
        container.id = 'avatar-notification-system';
        container.innerHTML = `
            <div class="avatar-container">
                <div class="avatar-image" id="raceAvatar"></div>
            </div>
            <div class="speech-bubble-container">
                <div class="speech-bubble" id="speechBubble">
                    <div class="speech-row">
                        <span class="speech-crest" id="advisorCrest" aria-hidden="true"></span>
                        <span class="speech-code" id="speechCode">MSG</span>
                        <div class="speech-content" id="speechContent">Welcome, Commander!</div>
                    </div>
                    <div class="speech-nav">
                        <span class="speech-source" id="advisorSource"></span>
                        <span class="nav-cluster">
                            <span class="nav-counter" id="navCounter">1/1</span>
                            <span class="nav-keys">
                                <button class="nav-btn nav-arrow" id="navUp" title="Previous message" aria-label="Previous message">${GLYPH_ARROW}</button>
                                <button class="nav-btn nav-arrow" id="navDown" title="Next message" aria-label="Next message">${GLYPH_ARROW}</button>
                                <button class="nav-btn speech-dismiss" id="speechDismiss" title="Dismiss message" aria-label="Dismiss message">${GLYPH_ACK}</button>
                            </span>
                        </span>
                    </div>
                </div>
                <div class="speech-pointer"></div>
            </div>
        `;

        addStyles();
        document.body.appendChild(container);

        // Set up event listeners
        document.getElementById('navUp').addEventListener('click', () => navigate(-1));
        document.getElementById('navDown').addEventListener('click', () => navigate(1));
        document.getElementById('speechDismiss').addEventListener('click', dismissCurrent);

        // Set default avatar
        updateAvatar(currentRaceId);

        if (!hasDismissedWelcome()) {
            addNotification('Welcome to Game of Worlds, Commander!', 'info', { welcome: true });
        } else {
            updateDisplay();
        }

        // The rail is drawn in a webfont; the first measurement happens before it
        // has loaded, so take a second one when it has.
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(queueRailSync).catch(() => {});
        }
        window.addEventListener('resize', queueRailSync);
    }

    function addStyles() {
        const style = document.createElement('style');
        style.id = 'avatar-notification-styles';
        style.textContent = `
            /* The fourth colour role, declared here as well as in
               notification-system.js so the advisory is correct on any page that
               loads only one of the two. Same value, same reasoning: it is the
               map key's Owned/live hue at readout brightness. */
            :root {
                --verdigris:    #6ba880;
                --verdigris-hi: #95c6a5;
                --verdigris-lo: #315e40;
            }

            /* Position is owned by applyResponsiveLayout, which stacks this under the
               event panel and the first-run checklist and hides it when the right side
               runs out of room. The top/right here are only a sane starting point for the
               moment before layout first runs.

               There used to be a body:has(#onboardingCard) rule that moved this to
               right:270px while the checklist was up. That put the advisor on top of the
               status column - it collided with the victory line, the empire summary, the
               connection bar and the sector panel at half a dozen window sizes. Two
               elements each guessing where the other is, is what the measured stack
               replaces; do not reintroduce a rule like it. */
            #avatar-notification-system {
                position: fixed;
                top: calc(42vh + 90px);
                right: 10px;
                display: flex;
                flex-direction: row-reverse;
                align-items: flex-start;
                gap: 12px;
                z-index: 150;
                pointer-events: none;
                font-family: var(--font-ui, 'Rajdhani', 'Segoe UI', system-ui, sans-serif);
            }

            /* Portrait bezel: the emblem is sunk into a steel frame, not floated in a
               chrome circle. style.css hides this entirely on the game screen - the
               disc used to occlude the event panel and the race is already named in
               the lobby and on the race card - so this is the shape it takes wherever
               the advisor is shown without that override. */
            .avatar-container {
                box-sizing: border-box;
                width: 68px;
                height: 68px;
                padding: 5px;
                flex-shrink: 0;
                pointer-events: none;
                border: 2px solid var(--ink, #05070d);
                border-radius: 2px;
                background: linear-gradient(180deg, #2b3447, #1d2433 52%, #141a26);
                box-shadow:
                    inset 1px 1px 0 rgba(176, 198, 232, 0.2),
                    inset -2px -2px 0 rgba(0, 0, 0, 0.6),
                    0 3px 0 var(--ink, #05070d),
                    0 8px 16px rgba(0, 0, 0, 0.5);
            }

            .avatar-image {
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            /* The emblem sits in a recessed socket, like every other instrument face. */
            .avatar-art-frame {
                width: 100%;
                height: 100%;
                display: grid;
                place-items: center;
                background: #05080e;
                box-shadow: inset 2px 2px 6px rgba(0, 0, 0, 0.8), inset -1px -1px 0 rgba(255, 255, 255, 0.04);
            }

            .avatar-art-frame img {
                width: 44px;
                height: 44px;
                object-fit: contain;
                filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8));
            }

            .speech-bubble-container {
                position: relative;
                max-width: 300px;
                pointer-events: none;
            }

            /* Base plate. On the game screen .game-page .speech-bubble replaces the
               background/border/shadow with the shared riveted recipe and adds the
               STANDING ADVISORY rail; these values are what it looks like without it. */
            .speech-bubble {
                box-sizing: border-box;
                padding: 11px 12px 10px;
                border-radius: 3px;
                color: var(--text, #cdd6e6);
                font-size: 12.5px;
                line-height: 1.45;
                background: linear-gradient(180deg, #2b3447, #1d2433 52%, #141a26);
                border: 2px solid var(--ink, #05070d);
                box-shadow:
                    inset 2px 2px 0 rgba(176, 198, 232, 0.22),
                    inset -2px -2px 0 rgba(0, 0, 0, 0.62),
                    0 4px 0 var(--ink, #05070d),
                    0 12px 26px rgba(0, 0, 0, 0.55);
            }

            /* MESSAGE ROW: the advisor's crest, the stencilled kind code in a
               recessed socket, then the copy. The chip is lifted verbatim from
               the toast plates - same font, same size, same socket - because
               they are the same product and the advisory was the weaker half of
               its own language. It also gives the copy the left anchor it never
               had. */
            .speech-row {
                display: flex;
                align-items: flex-start;
                gap: 9px;
                margin-bottom: 8px;
            }
            /* THE ADVISOR, PUT BACK. This panel is the character channel and it
               was shipping the character as the grey mono string "TERRAN EMPIRE"
               in the footer, because style.css hides the companion portrait disc
               (correctly - it occluded the event panel behind it). The crest is
               now INSIDE the plate, where it cannot occlude anything, in the same
               recessed socket every other instrument face uses.

               40x30, not 40x40: the published crests are 256x193, so a 4:3 socket
               shows the art at its full width with no letterboxing and costs the
               right-hand stack 10px less height than a square one would. Height
               in this panel is a real budget - it is the last entry in a measured
               stack that HIDES whatever no longer fits - and the 2px taken back
               off the row's bottom margin above pays part of it. */
            .speech-crest {
                position: relative;
                flex: 0 0 auto;
                box-sizing: border-box;
                width: 40px;
                height: 30px;
                margin-top: 1px;
            }
            /* The socket's recess has to be drawn OVER the art. .avatar-art-frame
               carries the inset shadow on itself, and an inset shadow paints under
               its own content - with an opaque crest filling the frame, the recess
               was invisible and the emblem read as a sticker. Same rim the code
               chip and the pager counter wear. */
            .speech-crest::after {
                content: "";
                position: absolute;
                inset: 0;
                pointer-events: none;
                box-shadow:
                    inset 2px 2px 4px rgba(0, 0, 0, 0.85),
                    inset -1px -1px 0 rgba(176, 198, 232, 0.1);
            }
            .speech-crest .avatar-art-frame { width: 100%; height: 100%; }
            .speech-crest .avatar-art-frame img {
                width: 100%;
                height: 100%;
                padding: 2px;
                box-sizing: border-box;
                object-fit: contain;
            }
            .speech-code {
                flex: 0 0 auto;
                margin-top: 2px;
                padding: 3px 5px 2px;
                font-family: var(--font-mono, 'Share Tech Mono', ui-monospace, monospace);
                font-size: 9.5px;
                letter-spacing: 0.12em;
                line-height: 1;
                color: var(--text, #cdd6e6);
                background: #05080e;
                box-shadow: inset 2px 2px 4px rgba(0, 0, 0, 0.85);
            }
            .speech-code.is-success { color: var(--verdigris, #6ba880); }
            .speech-code.is-warning { color: var(--amber-hi, #ffce80); }
            .speech-code.is-error   { color: var(--red-hi, #ff7f63); }

            .speech-content {
                flex: 1 1 auto;
                min-width: 0;
                min-height: 17px;
            }

            /* Severity, on the console's four roles: steel for information,
               verdigris for a thing gained or secured, amber for anything wanting
               a decision, crimson for a loss. The chip above carries the same
               distinction in a channel that survives greyscale; this is the
               second signal, not the only one. */
            .speech-content.info    { color: var(--text, #cdd6e6); }
            .speech-content.success { color: var(--verdigris, #6ba880); }
            .speech-content.warning { color: var(--amber-hi, #ffce80); }
            .speech-content.error   { color: var(--red-hi, #ff7f63); }
            /* style.css pins .game-page .speech-content.success to --amber-hi with
               !important, which was correct when success and warning were the same
               role and is now the one thing standing between the advisory and the
               four-role palette. An id selector plus !important is the only thing
               that outranks it from a file that does not own the stylesheet; the
               HANDOFF asks for the three lines there to be retired, at which point
               this block drops back to plain specificity. */
            #avatar-notification-system .speech-content.success { color: var(--verdigris, #6ba880) !important; }
            #avatar-notification-system .speech-content.warning { color: var(--amber-hi, #ffce80) !important; }
            #avatar-notification-system .speech-content.error   { color: var(--red-hi, #ff7f63) !important; }

            /* CONTROL ROW: three anchored groups, not two ends and a hole.
               space-between with a counter at one end and keys at the other left ~197px
               of flat panel in the middle of a 364px instrument. The left anchor is who
               is speaking, at a size that fits inside the key row's own height and
               costs the stack nothing.

               ONE HEIGHT, ONE TOP EDGE. align-items:center lines the row up on its
               MIDDLE, so five controls of four different intrinsic heights (source
               well 19px, counter 21px, keys 22px) began at three different y - a
               measured 2px of stagger, plainly visible at 4x, and it read as three
               kits bolted together rather than one installed instrument bank. Every
               control in the row is now pinned to --adv-row-h and stretched to it,
               so they share a top and a bottom by construction. */
            .speech-nav {
                --adv-row-h: 22px;
                display: flex;
                align-items: stretch;
                justify-content: space-between;
                gap: 8px;
                border-top: 2px solid var(--ink, #05070d);
                box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.05);
                padding-top: 8px;
                margin-top: 2px;
            }
            /* Source stencil: who is speaking and when they said it, in the same
               recessed socket as the counter beside it. The clock is not
               decoration: an Epic match ticks once a day, so "when did my advisor
               say this" is a real question.

               THE TICK HATCH IS GONE. A 4px hatch was laid across the empty middle
               of this well on the theory that a graduated scale beats a vacant
               field. It could not carry a value - nothing in an advisory depletes -
               so what shipped was an unlabelled meter with no scale, no unit and a
               faded right end, on the game's most persistent overlay. An
               instrument that measures nothing is worse than empty machined space,
               and removing it also removed the backplate hack the type needed to
               stay legible on top of it. Two fewer layers, one less lie.

               AND THE READOUT SAYS WHAT IT IS. "08:16" alone next to that hatch
               read as a countdown - it is a wall clock, the time the advisory was
               issued - and at 9px Share Tech Mono the dotted zero closed up into
               an 8. It now carries a stencilled LOG tag and runs at 11px with
               tabular figures, which the row's fixed height absorbs for free. */
            .speech-source {
                box-sizing: border-box;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                flex: 1 1 auto;
                min-width: 0;
                height: var(--adv-row-h, 22px);
                padding: 0 7px;
                font-family: var(--font-mono, 'Share Tech Mono', ui-monospace, monospace);
                font-size: 9px;
                letter-spacing: 0.13em;
                line-height: 1;
                white-space: nowrap;
                overflow: hidden;
                color: var(--faint, #5e6678);
                background: #05080e;
                box-shadow: inset 2px 2px 4px rgba(0, 0, 0, 0.85);
            }
            .speech-source > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
            .speech-source .speech-src-who { flex: 0 1 auto; }
            .speech-source .speech-src-when {
                flex: 0 0 auto;
                display: flex;
                align-items: baseline;
                gap: 5px;
                /* 12px, not the well's 9px. Share Tech Mono's zero carries a
                   centre dot, and at 9px that dot bleeds into the lobes and
                   closes the counter: "08:16" measured as two adjacent glyphs
                   the reviewer read as 8 and 8. At 12px the dot is an island
                   inside an open bowl and 0 cannot be an 8. The row's fixed
                   height absorbs the size for free. */
                font-size: 12px;
                letter-spacing: 0.06em;
                font-variant-numeric: lining-nums tabular-nums;
                color: var(--muted, #8b94a8);
            }
            .speech-source .speech-src-when b {
                font-weight: normal;
                font-size: 8.5px;
                letter-spacing: 0.16em;
                color: var(--faint, #5e6678);
            }
            .nav-cluster { display: flex; align-items: stretch; gap: 8px; flex: 0 0 auto; }

            .nav-keys { display: flex; align-items: stretch; gap: 5px; }

            .nav-btn {
                box-sizing: border-box;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 26px;
                height: var(--adv-row-h, 22px);
                padding: 0;
                cursor: pointer;
                pointer-events: auto;
                color: var(--text, #cdd6e6);
                border: 2px solid var(--ink, #05070d);
                border-radius: 0;
                background: linear-gradient(180deg, #445064, #1d2433 55%, #141a26);
                box-shadow:
                    inset 1px 1px 0 rgba(255, 255, 255, 0.16),
                    inset -1px -1px 0 rgba(0, 0, 0, 0.5),
                    0 2px 0 var(--ink, #05070d);
                transition: filter 0.12s ease;
            }

            /* The background is restated on hover, not just the brightness: a
               legacy global button:hover:not(:disabled) in style.css scores
               (0,2,1) and flattens any console key whose face is declared at
               (0,2,0) into a plain blue-grey slab. The game screen happens to be
               safe because its .nav-btn face is !important; every other page that
               uses this module is not. */
            /* style.css pins the key to a literal 22px at (0,3,0); restate it from
               the row constant at (1,1,0) so the whole bank still moves together
               if that constant ever changes. */
            #avatar-notification-system .nav-btn { height: var(--adv-row-h, 22px); }
            #avatar-notification-system .nav-btn:hover:not(:disabled) {
                filter: brightness(1.16);
                background: linear-gradient(180deg, var(--steel-hi, #445064), var(--steel-3, #1d2433) 55%, var(--steel-4, #141a26));
            }
            .nav-btn:active:not(:disabled) {
                transform: translateY(2px);
                box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.7);
            }

            /* A dead key sinks into its socket rather than fading out: a half-opacity
               raised key still reads as pressable. The MARK does not sink with it -
               a #5e6678 glyph on a #14181f fill measured 2.67:1, under the 3:1 floor
               for a control, and read as an artifact rather than as an unlit key. */
            .nav-btn:disabled {
                cursor: default;
                opacity: 1;
                background: linear-gradient(180deg, #1a2029, #12171f);
                box-shadow: inset 2px 2px 4px rgba(0, 0, 0, 0.7);
            }

            /* Colour lives on the SVG, not on the button, for two reasons: the page
               stylesheet pins the dismiss key's own colour to a salmon that appears
               nowhere else in the console palette, with !important, and a mark whose
               weight is mine is a mark that renders the same everywhere. */
            .nav-btn .nav-mark { display: block; width: 11px; height: 8px; color: var(--text, #cdd6e6); }
            .nav-btn .nav-mark--cross { width: 10px; height: 10px; }
            .nav-btn:disabled .nav-mark { color: var(--muted, #8b94a8); }
            .nav-btn:hover:not(:disabled) .nav-mark { color: var(--bright, #eef3fb); }
            /* The down key is the up key upside down - see GLYPH_ARROW. */
            #navDown .nav-mark { transform: scaleY(-1); }

            /* Same height as the keys either side of it, set from the id so it
               outranks style.css's own .game-page .speech-nav .nav-counter. */
            #avatar-notification-system .nav-counter {
                box-sizing: border-box;
                display: flex;
                align-items: center;
                justify-content: center;
                height: var(--adv-row-h, 22px);
                font-family: var(--font-mono, 'Share Tech Mono', ui-monospace, monospace);
                font-size: 10px;
                letter-spacing: 0.08em;
                color: var(--bronze, #c79a47);
                min-width: 42px;
                padding: 0 6px;
                text-align: center;
                background: #05080e;
                box-shadow: inset 2px 2px 4px rgba(0, 0, 0, 0.85);
            }

            .speech-pointer {
                position: absolute;
                right: -8px;
                top: 20px;
                width: 0;
                height: 0;
                border-top: 8px solid transparent;
                border-bottom: 8px solid transparent;
                border-left: 8px solid var(--ink, #05070d);
            }

            /* New message: the plate takes a short flash of light rather than a bounce.
               A speech bubble that scales looks like a web toast; an instrument that
               catches the light looks like it just took a reading. */
            @keyframes advisoryStrike {
                0%   { filter: brightness(1); }
                18%  { filter: brightness(1.32); }
                100% { filter: brightness(1); }
            }

            .speech-bubble.new-message {
                animation: advisoryStrike 0.42s ease-out;
            }

            /* Mobile responsive */
            @media (max-width: 768px) {
                #avatar-notification-system {
                    top: auto;
                    bottom: 400px;
                    right: 10px;
                    flex-direction: column;
                    align-items: flex-end;
                }

                .avatar-container {
                    width: 54px;
                    height: 54px;
                    order: 1;
                }

                .avatar-art-frame img {
                    width: 34px;
                    height: 34px;
                }

                .speech-bubble-container {
                    order: 0;
                    max-width: 210px;
                }

                .speech-bubble {
                    font-size: 12px;
                    padding: 10px 11px;
                }

                .speech-pointer {
                    display: none;
                }
            }

            @media (max-width: 480px) {
                #avatar-notification-system {
                    display: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Reserve exactly as much room under the advisory rail as the rail actually
     * takes.
     *
     * The rail is an absolutely positioned ::before, so it contributes nothing to
     * layout and the body copy only clears it because a padding-top constant says
     * so. That constant is a bet on how tall 10px Russo One renders, and a bet
     * that loses puts the first line of the advisory behind the rail.
     *
     * Three rules keep this from becoming a second opinion about the design:
     *
     *   - it only ever RAISES the top reservation, never lowers it;
     *   - it raises it to exactly the measured rail, not a pixel more (air under
     *     the rail is taste and taste belongs to the stylesheet; clearance is
     *     arithmetic and belongs here);
     *   - and it PAYS FOR THE DIFFERENCE OUT OF THE BOTTOM PADDING, so the panel
     *     does not get taller.
     *
     * That last rule is not tidiness. This panel is the last entry in a measured
     * right-hand stack that hides whatever no longer fits above the map legend,
     * and on a 1920x1080 screen with a full event feed the slack is single
     * digits: an earlier revision that added 6px of air cost the player the
     * entire standing advisory, which is a much worse bug than the one being
     * fixed. As shipped the rail renders 28px against a 26px reservation, so this
     * moves two pixels from the foot to the head and changes nothing else. The
     * overlap was eating half-leading rather than ink, which is why it never
     * showed up in a screenshot - but half-leading is all the margin there is.
     */
    function syncRailClearance() {
        railSyncQueued = false;
        const bubble = document.getElementById('speechBubble');
        if (!bubble || !window.getComputedStyle) return;

        // Measure against the STYLESHEET's reservation, not against a value this
        // function may already have written, or it would ratchet upward.
        bubble.style.removeProperty('padding-top');
        bubble.style.removeProperty('padding-bottom');

        let rail;
        try {
            rail = window.getComputedStyle(bubble, '::before');
        } catch (err) {
            return;
        }
        if (!rail || !rail.content || rail.content === 'none' || rail.position !== 'absolute') return;

        const px = value => parseFloat(value) || 0;
        // Content-box: height excludes the rail's own padding and border.
        const railHeight = px(rail.height) + px(rail.paddingTop) + px(rail.paddingBottom)
            + px(rail.borderTopWidth) + px(rail.borderBottomWidth);
        if (!railHeight) return;

        const box = window.getComputedStyle(bubble);
        const reserved = px(box.paddingTop);
        const deficit = railHeight - reserved;
        if (deficit <= 0.5) return;

        const foot = px(box.paddingBottom);
        const borrowed = Math.min(Math.ceil(deficit), Math.max(0, foot - 4));
        bubble.style.setProperty('padding-top', `${Math.ceil(reserved + deficit)}px`, 'important');
        if (borrowed > 0) {
            bubble.style.setProperty('padding-bottom', `${foot - borrowed}px`, 'important');
        }
    }

    function queueRailSync() {
        if (railSyncQueued) return;
        railSyncQueued = true;
        requestAnimationFrame(syncRailClearance);
    }

    function setRace(raceId) {
        currentRaceId = raceId || 1;
        updateAvatar(currentRaceId);
    }

    function updateAvatar(raceId) {
        const art = generateAvatar(raceId);
        const avatarEl = document.getElementById('raceAvatar');
        if (avatarEl) {
            avatarEl.innerHTML = art;
        }
        // The inline crest is the one that survives on the game screen: the
        // companion disc above is display:none there, which is exactly how the
        // character channel came to have no character. Inside the plate it
        // cannot occlude the panel behind it, which was the only reason the
        // disc was hidden.
        const crestEl = document.getElementById('advisorCrest');
        if (crestEl) {
            crestEl.innerHTML = art;
        }
        updateSource();
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    }

    /**
     * Who is speaking, and when, as the two ends of the footer readout.
     *
     * They are separate spans on purpose - the well is labelled at both ends.
     * A single centre-dotted string left the right half of a 300px well empty on
     * every advisory the game has ever shown.
     *
     * The stamp carries a LOG tag because a bare "08:16" in a mono face, sitting
     * in a sunken well on a turn-based game's HUD, reads as a countdown. It is
     * not one: it is the wall-clock time the advisory was issued, which matters
     * because an Epic match ticks once a day. Three characters of stencil is a
     * cheaper fix than an ambiguity a player has to learn their way out of.
     */
    function updateSource() {
        const el = document.getElementById('advisorSource');
        if (!el) return;
        const race = raceAvatars[currentRaceId] || raceAvatars[1];
        const current = notifications[currentIndex];
        let stamp = '';
        if (current && current.timestamp) {
            try {
                stamp = new Date(current.timestamp)
                    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            } catch (err) { stamp = ''; }
        }
        el.innerHTML = `<span class="speech-src-who">${escapeHtml(race.name.toUpperCase())}</span>`
            + `<span class="speech-src-when"><b>LOG</b>${escapeHtml(stamp || '--:--')}</span>`;
        el.title = `${race.name} advisory, logged ${stamp || 'time unknown'}`;
    }

    function hasDismissedWelcome() {
        try {
            return localStorage.getItem(WELCOME_STORAGE_KEY) === '1';
        } catch (err) {
            return false;
        }
    }

    function markWelcomeDismissed() {
        try {
            localStorage.setItem(WELCOME_STORAGE_KEY, '1');
        } catch (err) { /* ignore */ }
    }

    /** Kept in step with NotificationSystem.normalizeType: an unknown tone used to
        produce an unstyled .speech-content class AND, now, a missing chip. */
    function normalizeType(type) {
        const key = String(type || 'info').toLowerCase();
        if (key === 'warn') return 'warning';
        if (key === 'fail' || key === 'danger') return 'error';
        return SEVERITY[key] ? key : 'info';
    }

    function addNotification(message, type = 'info', options = {}) {
        const notification = {
            message,
            type: normalizeType(type),
            timestamp: Date.now(),
            welcome: Boolean(options.welcome)
        };

        notifications.unshift(notification);
        if (notifications.length > maxNotifications) {
            notifications.pop();
        }

        currentIndex = 0;
        updateDisplay();

        // Animate
        const bubble = document.getElementById('speechBubble');
        if (bubble) {
            bubble.classList.remove('new-message');
            void bubble.offsetWidth; // Force reflow
            bubble.classList.add('new-message');
        }
    }

    function navigate(direction) {
        const newIndex = currentIndex + direction;
        if (newIndex >= 0 && newIndex < notifications.length) {
            currentIndex = newIndex;
            updateDisplay();
        }
    }

    function dismissCurrent() {
        if (notifications.length === 0) {
            updateDisplay();
            return;
        }

        const current = notifications[currentIndex];
        if (current && current.welcome) {
            markWelcomeDismissed();
        }

        notifications.splice(currentIndex, 1);
        currentIndex = Math.max(0, Math.min(currentIndex, notifications.length - 1));
        updateDisplay();
    }

    function updateDisplay() {
        const contentEl = document.getElementById('speechContent');
        const codeEl = document.getElementById('speechCode');
        const counterEl = document.getElementById('navCounter');
        const upBtn = document.getElementById('navUp');
        const downBtn = document.getElementById('navDown');
        const bubbleEl = document.getElementById('speechBubble');

        if (!contentEl) return;
        if (notifications.length === 0) {
            if (bubbleEl) {
                bubbleEl.style.display = 'none';
            }
            return;
        }

        if (bubbleEl) {
            bubbleEl.style.display = 'block';
        }

        const current = notifications[currentIndex];
        contentEl.textContent = current.message;
        contentEl.className = `speech-content ${current.type}`;

        const severity = SEVERITY[current.type] || SEVERITY.info;
        if (codeEl) {
            codeEl.textContent = severity.code;
            codeEl.className = `speech-code ${severity.tone}`.trim();
        }

        // A PAGER FOR ONE MESSAGE IS A BROKEN-LOOKING TOOLBAR. With a single entry
        // both ends of the list are the current index, so both arrows were dead -
        // and that is the state every new player is handed. Do not render them.
        const paged = notifications.length > 1;
        if (counterEl) {
            counterEl.style.display = paged ? '' : 'none';
            counterEl.textContent = `${currentIndex + 1}/${notifications.length}`;
        }
        [upBtn, downBtn].forEach(btn => { if (btn) btn.style.display = paged ? '' : 'none'; });

        if (upBtn) upBtn.disabled = currentIndex === 0;
        if (downBtn) downBtn.disabled = currentIndex >= notifications.length - 1;

        updateSource();
        queueRailSync();
    }

    // Convenience methods matching NotificationSystem API
    function show(message, type = 'info') {
        addNotification(message, type);
    }

    const game = {
        connected: () => show('Connected to game server', 'success'),
        disconnected: () => show('Connection lost!', 'error'),
        turnComplete: () => show('Turn completed', 'info'),
        battleWon: (sector) => show(`Victory in sector ${sector}!`, 'success'),
        battleLost: (sector) => show(`Defeat in sector ${sector}`, 'error'),
        resourcesLow: () => show('Resources running low!', 'warning'),
        techUnlocked: (tech) => show(`${tech} researched!`, 'success'),
        buildingComplete: (building) => show(`${building} complete!`, 'success'),
        shipBuilt: (ship) => show(`${ship} constructed`, 'info'),
        sectorColonized: (sector) => show(`Sector ${sector} colonized!`, 'success'),
        underAttack: (sector) => show(`Sector ${sector} under attack!`, 'error')
    };

    return {
        initialize,
        setRace,
        show,
        addNotification,
        game
    };
})();

// Auto-initialize
if (typeof window !== 'undefined') {
    window.AvatarNotifications = AvatarNotifications;
    document.addEventListener('DOMContentLoaded', () => {
        AvatarNotifications.initialize();
    });
}
