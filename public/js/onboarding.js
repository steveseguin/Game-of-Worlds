/**
 * onboarding.js - First-game guided checklist
 *
 * Watches the commands the player sends (and key server replies) and checks
 * off the core loop: select home, build, research, probe, move, colonize,
 * end turn. Designed to teach the probe-vs-move risk decision and the
 * colony-ship flow without blocking anything.
 *
 * Loaded before connect.js; connect.js calls Onboarding.attach(websocket)
 * after opening the socket and Onboarding.observe(message) for each
 * incoming message.
 */
window.Onboarding = (function () {
    const STORAGE_KEY = 'gow-onboarding-v1';

    const STEPS = [
        {
            id: 'inspect',
            label: 'Inspect a sector',
            hint: 'Click your gold homeworld tile (or the Home button).',
            outgoing: ['//sector:']
        },
        {
            id: 'build',
            label: 'Construct a building',
            hint: 'Build tab: a Metal Extractor keeps your economy growing.',
            outgoing: ['//buybuilding:']
        },
        {
            id: 'ship',
            label: 'Build a ship',
            hint: 'Build tab: scouts are cheap eyes; colony ships claim planets.',
            outgoing: ['//buyship:']
        },
        {
            id: 'research',
            label: 'Research a technology',
            hint: 'Research tab: each colored branch is a different playstyle.',
            outgoing: ['//buytech:'],
            incoming: [/^Success: Researched /]
        },
        {
            id: 'probe',
            label: 'Probe an unknown sector',
            hint: 'Probes cost 300 crystal but spare your ships from hazards.',
            outgoing: ['//probe:']
        },
        {
            id: 'move',
            label: 'Move your fleet',
            hint: 'Select a tile next to your ships. Beware asteroid belts and black holes!',
            outgoing: ['//move', '//sendmmf:', '//mmf']
        },
        {
            id: 'colonize',
            label: 'Colonize a planet',
            hint: 'Move a colony ship to a planet whose terraform requirement you meet.',
            outgoing: ['//colonize'],
            incoming: [/^Success: Colonized /]
        },
        {
            id: 'endturn',
            label: 'End your turn',
            hint: 'Done for now? End the turn instead of waiting out the clock.',
            outgoing: ['//start']
        }
    ];

    let state = { done: {}, dismissed: false, celebrated: false };
    let card = null;

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) state = { ...state, ...JSON.parse(raw) };
        } catch (err) { /* private mode etc. */ }
    }

    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (err) { /* ignore */ }
    }

    function allDone() {
        return STEPS.every(step => state.done[step.id]);
    }

    function ensureCard() {
        if (card || state.dismissed || allDone()) return;
        if (!window.location.pathname.includes('game.html')) return;
        card = document.createElement('aside');
        card.id = 'onboardingCard';
        card.style.cssText = 'position:fixed;right:10px;top:230px;z-index:140;width:236px;'
            + 'background:rgba(12,16,33,0.93);border:1px solid rgba(90,245,196,0.3);border-radius:12px;'
            + 'padding:10px 12px;color:#e8ecff;font-size:12px;box-shadow:0 10px 26px rgba(0,0,0,0.45);';
        document.body.appendChild(card);
        render();
    }

    function render() {
        if (!card) return;
        if (state.dismissed) {
            card.remove();
            card = null;
            return;
        }
        const doneCount = STEPS.filter(step => state.done[step.id]).length;
        const next = STEPS.find(step => !state.done[step.id]);
        const rows = STEPS.map(step => {
            const done = Boolean(state.done[step.id]);
            const active = next && next.id === step.id;
            return `<div style="display:flex;gap:7px;align-items:baseline;opacity:${done ? 0.55 : 1};margin:3px 0;">
                <span style="color:${done ? '#7ee787' : (active ? '#42d8c8' : 'rgba(232,236,255,0.45)')};font-weight:700;">${done ? '✓' : '○'}</span>
                <span style="${done ? 'text-decoration:line-through;' : ''}${active ? 'font-weight:700;' : ''}">${step.label}</span>
            </div>`;
        }).join('');
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <b style="color:#42d8c8;">First Steps ${doneCount}/${STEPS.length}</b>
                <button id="onboardingHide" style="background:transparent;border:none;color:#cfd7ff;cursor:pointer;font-size:14px;line-height:1;" title="Hide checklist">✕</button>
            </div>
            ${rows}
            ${next ? `<div style="margin-top:7px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.08);color:rgba(232,236,255,0.75);line-height:1.4;">${next.hint}</div>` : ''}
        `;
        card.querySelector('#onboardingHide')?.addEventListener('click', () => {
            state.dismissed = true;
            save();
            render();
        });
    }

    function complete(stepId) {
        if (state.done[stepId]) return;
        state.done[stepId] = true;
        save();
        render();
        if (allDone() && !state.celebrated) {
            state.celebrated = true;
            save();
            if (window.NotificationSystem?.notify) {
                window.NotificationSystem.notify('Checklist complete', 'You know the core loop. Expand carefully - every move is a trade-off.', 'success', 8000);
            }
            setTimeout(() => {
                if (card) { card.remove(); card = null; }
            }, 6000);
        }
    }

    function observeOutgoing(command) {
        const text = String(command || '');
        STEPS.forEach(step => {
            (step.outgoing || []).forEach(prefix => {
                if (text.indexOf(prefix) === 0) complete(step.id);
            });
        });
    }

    function observe(message) {
        const text = String(message || '');
        // Surface the checklist once the game is actually running.
        if (text.indexOf('startgame::') === 0 || text.indexOf('techstate::') === 0) {
            ensureCard();
        }
        STEPS.forEach(step => {
            (step.incoming || []).forEach(pattern => {
                if (pattern.test(text)) complete(step.id);
            });
        });
    }

    function attach(ws) {
        if (!ws || ws.__onboardingWrapped) return;
        ws.__onboardingWrapped = true;
        const originalSend = ws.send.bind(ws);
        ws.send = function (data) {
            try {
                observeOutgoing(data);
            } catch (err) { /* never break the wire */ }
            return originalSend(data);
        };
    }

    load();
    return { attach, observe };
})();
