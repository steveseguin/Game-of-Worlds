// tour.js - lightweight guided tour for new players
(function() {
    const steps = [
        {
            id: 'step-resources',
            selector: '#resourceBar',
            title: 'Resources',
            body: 'Metal, Crystal, and Research fuel your builds and tech. Epic mode boosts per-turn income so daily turns stay meaningful.',
            placement: 'bottom'
        },
        {
            id: 'step-map',
            selector: '#minimapid',
            title: 'Galaxy Map',
            body: 'Hover a sector to see owner/ships/buildings. Click to select, move fleets, and build on owned worlds.',
            placement: 'left'
        },
        {
            id: 'step-actions',
            selector: '#controlpad',
            title: 'Build & Move',
            body: 'Use the control pad to build ships/buildings on owned sectors. Moves and colonization happen from selected sectors.',
            placement: 'top'
        },
        {
            id: 'step-turns',
            selector: '#turnTimeBar',
            title: 'Turns',
            body: 'Quick games use fast timers; Epic games tick once per day. Queue actions and you can log out—orders process on turn rollover.',
            placement: 'right'
        }
    ];

    let current = 0;
    let overlay;
    let bubble;

    function createOverlay() {
        overlay = document.createElement('div');
        overlay.id = 'tour-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.55)', zIndex: 4000,
        });
        overlay.addEventListener('click', endTour);
        document.body.appendChild(overlay);
    }

    function createBubble() {
        bubble = document.createElement('div');
        bubble.id = 'tour-bubble';
        bubble.innerHTML = `
            <div id="tour-title" style="font-weight:700;margin-bottom:6px;"></div>
            <div id="tour-body" style="font-size:13px;line-height:1.4;margin-bottom:10px;color:#cfd7ff;"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <button id="tour-skip" style="background:transparent;border:1px solid #555;color:#cfd7ff;padding:6px 10px;border-radius:6px;cursor:pointer;">Skip</button>
                <div style="display:flex;gap:6px;align-items:center;">
                    <button id="tour-prev" style="background:#2b334f;border:none;color:#e8ecff;padding:6px 10px;border-radius:6px;cursor:pointer;">Back</button>
                    <button id="tour-next" style="background:#4c7cff;border:none;color:#0b1020;padding:6px 12px;border-radius:6px;font-weight:700;cursor:pointer;">Next</button>
                </div>
            </div>
        `;
        Object.assign(bubble.style, {
            position: 'fixed', zIndex: 4001, maxWidth: '320px', background: '#0f1424',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '12px',
            boxShadow: '0 12px 30px rgba(0,0,0,0.35)', color: '#e8ecff'
        });
        document.body.appendChild(bubble);
        bubble.querySelector('#tour-skip').onclick = endTour;
        bubble.querySelector('#tour-prev').onclick = () => move(-1);
        bubble.querySelector('#tour-next').onclick = () => move(1);
    }

    function positionBubble(step) {
        const target = document.querySelector(step.selector);
        if (!target) return endTour();
        const rect = target.getBoundingClientRect();
        const margin = 12;
        let top = rect.bottom + margin;
        let left = rect.left;
        if (step.placement === 'left') {
            top = rect.top;
            left = rect.left - (bubble.offsetWidth + margin);
        } else if (step.placement === 'right') {
            top = rect.top;
            left = rect.right + margin;
        } else if (step.placement === 'top') {
            top = rect.top - (bubble.offsetHeight + margin);
        }
        top = Math.max(10, top);
        left = Math.max(10, Math.min(left, window.innerWidth - bubble.offsetWidth - 10));
        bubble.style.top = `${top}px`;
        bubble.style.left = `${left}px`;
    }

    function renderStep() {
        const step = steps[current];
        if (!step) return endTour();
        bubble.querySelector('#tour-title').textContent = step.title;
        bubble.querySelector('#tour-body').textContent = step.body;
        const nextBtn = bubble.querySelector('#tour-next');
        nextBtn.textContent = current === steps.length - 1 ? 'Finish' : 'Next';
        positionBubble(step);
    }

    function move(delta) {
        current = Math.max(0, Math.min(steps.length - 1, current + delta));
        renderStep();
    }

    function endTour() {
        if (overlay) overlay.remove();
        if (bubble) bubble.remove();
        overlay = null;
        bubble = null;
        current = 0;
        sessionStorage.setItem('gow-tour-dismissed', '1');
    }

    function startTour(force = false) {
        if (!force && sessionStorage.getItem('gow-tour-dismissed') === '1') return;
        createOverlay();
        createBubble();
        renderStep();
    }

    window.Tour = { start: startTour, end: endTour };

    window.addEventListener('load', () => {
        setTimeout(() => startTour(false), 1200);
    });
})();
