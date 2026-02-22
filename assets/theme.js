/* Theme toggle — triple-tap any h1 to cycle System / Light / Dark */
(function () {
    var MODES = ['system', 'light', 'dark'];
    var LABELS = { system: 'System', light: 'Light', dark: 'Dark' };
    var ICONS = { system: '\uD83D\uDCBB', light: '\u2600\uFE0F', dark: '\uD83C\uDF19' };
    var STORAGE_KEY = 'theme';
    var TAP_WINDOW = 500; // ms — 3 taps within this window triggers toggle

    // --- Apply saved preference on load ---
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved !== 'system') {
        document.documentElement.setAttribute('data-theme', saved);
    }

    // --- Triple-tap detection ---
    var tapTimes = [];

    document.addEventListener('click', function (e) {
        // Walk up from target to find an h1 (handles clicks on child spans, etc.)
        var node = e.target;
        while (node && node !== document) {
            if (node.tagName === 'H1') break;
            node = node.parentElement;
        }
        if (!node || node.tagName !== 'H1') return;

        var now = Date.now();
        tapTimes.push(now);

        // Keep only taps within the window
        while (tapTimes.length && now - tapTimes[0] > TAP_WINDOW) {
            tapTimes.shift();
        }

        if (tapTimes.length >= 3) {
            tapTimes = [];
            // Clear text selection caused by rapid clicking
            var sel = window.getSelection();
            if (sel) sel.removeAllRanges();
            cycle();
        }
    });

    // --- Cycle theme ---
    function cycle() {
        var current = localStorage.getItem(STORAGE_KEY) || 'system';
        var idx = MODES.indexOf(current);
        var next = MODES[(idx + 1) % MODES.length];

        if (next === 'system') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.removeItem(STORAGE_KEY);
        } else {
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem(STORAGE_KEY, next);
        }

        showToast(next);
    }

    // --- Toast notification ---
    function showToast(mode) {
        var existing = document.getElementById('theme-toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.id = 'theme-toast';
        toast.textContent = ICONS[mode] + ' ' + LABELS[mode];

        var s = toast.style;
        s.position = 'fixed';
        s.bottom = '2rem';
        s.left = '50%';
        s.transform = 'translateX(-50%)';
        s.background = 'var(--color-surface)';
        s.color = 'var(--color-text)';
        s.border = '1px solid var(--color-border)';
        s.borderRadius = '999px';
        s.padding = '0.5rem 1rem';
        s.fontSize = '0.85rem';
        s.fontWeight = '600';
        s.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        s.boxShadow = '0 4px 12px var(--color-shadow)';
        s.zIndex = '99999';
        s.pointerEvents = 'none';
        s.whiteSpace = 'nowrap';

        // Animation — respect reduced motion
        var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        s.opacity = reduceMotion ? '1' : '0';
        s.transition = reduceMotion ? 'none' : 'opacity 0.25s ease';

        document.body.appendChild(toast);

        if (!reduceMotion) {
            // Force reflow then fade in
            toast.offsetHeight; // eslint-disable-line no-unused-expressions
            s.opacity = '1';
        }

        setTimeout(function () {
            if (!reduceMotion) {
                s.opacity = '0';
                setTimeout(function () { toast.remove(); }, 250);
            } else {
                toast.remove();
            }
        }, 1500);
    }
})();
