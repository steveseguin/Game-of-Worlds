(() => {
    const buttons = [...document.querySelectorAll('[data-filter]')];
    const reels = [...document.querySelectorAll('[data-category]')];

    buttons.forEach((button) => {
        button.addEventListener('click', () => {
            const filter = button.dataset.filter;
            buttons.forEach((item) => item.classList.toggle('is-active', item === button));
            reels.forEach((reel) => {
                const visible = filter === 'all' || reel.dataset.category === filter;
                reel.hidden = !visible;
            });
        });
    });

    document.querySelectorAll('[data-year]').forEach((node) => {
        node.textContent = new Date().getFullYear();
    });
})();
