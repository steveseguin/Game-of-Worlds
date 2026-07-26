(() => {
    'use strict';

    const toc = document.querySelector('.toc');
    const toggle = document.querySelector('.toc-toggle');
    const links = [...document.querySelectorAll('.toc nav a')];
    const sections = links.map(link => document.querySelector(link.hash)).filter(Boolean);
    const progress = document.querySelector('[data-read-progress]');

    if (toc && toggle) {
        toggle.addEventListener('click', () => {
            const open = toc.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', String(open));
            toggle.querySelector('span').textContent = open ? '−' : '+';
        });
        links.forEach(link => link.addEventListener('click', () => {
            toc.classList.remove('is-open');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.querySelector('span').textContent = '+';
        }));
    }

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
            const visible = entries.filter(entry => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
            if (!visible) return;
            links.forEach(link => {
                const active = link.hash === `#${visible.target.id}`;
                link.classList.toggle('is-active', active);
                if (active) link.setAttribute('aria-current', 'location');
                else link.removeAttribute('aria-current');
            });
        }, { rootMargin: '-18% 0px -62% 0px', threshold: [0, .1, .5] });
        sections.forEach(section => observer.observe(section));
    }

    if (progress) {
        let scheduled = false;
        const update = () => {
            const distance = document.documentElement.scrollHeight - innerHeight;
            progress.style.transform = `scaleX(${distance > 0 ? Math.min(1, scrollY / distance) : 1})`;
            scheduled = false;
        };
        addEventListener('scroll', () => {
            if (!scheduled) {
                scheduled = true;
                requestAnimationFrame(update);
            }
        }, { passive: true });
        update();
    }
})();
