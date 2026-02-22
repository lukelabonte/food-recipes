/* Theme toggle — footer icon to switch between Light / Dark */
(function () {
    var STORAGE_KEY = 'theme';

    // --- Apply saved preference on load (runs before paint) ---
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
        document.documentElement.setAttribute('data-theme', saved);
    }

    // --- Effective theme (uses OS preference when nothing saved) ---
    function getEffectiveTheme() {
        var s = localStorage.getItem(STORAGE_KEY);
        if (s === 'light' || s === 'dark') return s;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    // --- Toggle theme ---
    function toggle() {
        var next = getEffectiveTheme() === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(STORAGE_KEY, next);
        return next;
    }

    // --- SVG icons ---
    var svgNS = 'http://www.w3.org/2000/svg';

    function createSunIcon() {
        var svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.5');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        var path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', 'M12 3v1m0 16v1m-8-9H3m18 0h-1m-2.636-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z');
        svg.appendChild(path);
        return svg;
    }

    function createMoonIcon() {
        var svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '1.5');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        var path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', 'M21.752 15.002A9.718 9.718 0 0 1 18 15.75 9.75 9.75 0 0 1 8.25 6c0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 12a9.75 9.75 0 0 0 16.942 6.632 9.718 9.718 0 0 0 1.81-3.63z');
        svg.appendChild(path);
        return svg;
    }

    // --- Theme toggle button ---

    function createToggle() {
        var btn = document.createElement('button');
        btn.className = 'theme-toggle';
        btn.setAttribute('aria-label', 'Toggle theme');
        btn.type = 'button';

        updateToggle(btn);

        btn.addEventListener('click', function () {
            var next = toggle();
            updateToggle(btn);
            showToast(next);
        });

        return btn;
    }

    function updateToggle(btn) {
        var effective = getEffectiveTheme();
        // Show sun icon in dark mode (tap to go light), moon icon in light mode (tap to go dark)
        while (btn.firstChild) btn.removeChild(btn.firstChild);
        btn.appendChild(effective === 'dark' ? createSunIcon() : createMoonIcon());
        btn.setAttribute('aria-label', effective === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }

    // --- Toast notification ---
    function showToast(mode) {
        var existing = document.getElementById('theme-toast');
        if (existing) existing.remove();

        var icon = mode === 'light' ? '\u2600\uFE0F' : '\uD83C\uDF19';
        var label = mode === 'light' ? 'Light' : 'Dark';

        var toast = document.createElement('div');
        toast.id = 'theme-toast';
        toast.textContent = icon + ' ' + label;

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

        var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        s.opacity = reduceMotion ? '1' : '0';
        s.transition = reduceMotion ? 'none' : 'opacity 0.25s ease';

        document.body.appendChild(toast);

        if (!reduceMotion) {
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

    // --- Build page footer ---

    function buildFooter() {
        var btn = createToggle();

        // Recipe pages have a .recipe container with a .nav-bar inside
        var recipeContainer = document.querySelector('.recipe');
        var isRecipePage = recipeContainer && recipeContainer.querySelector('.nav-bar');

        if (isRecipePage) {
            var footer = document.createElement('div');
            footer.className = 'page-footer';

            // Move bottom back-link into footer (skip the one inside .nav-bar)
            var backLinks = recipeContainer.querySelectorAll(':scope > .back-link');
            if (backLinks.length > 0) {
                footer.appendChild(backLinks[backLinks.length - 1]);
            }

            // Always create center span for grid alignment (3 children = 3 columns)
            var centerSpan = document.createElement('span');
            centerSpan.className = 'footer-contributor';

            // Move contributor into footer (recipe.js preserved it in .recipe-attribution)
            var attribution = recipeContainer.querySelector('.recipe-attribution');
            if (attribution) {
                var contributor = attribution.querySelector('.contributor');
                if (contributor) {
                    centerSpan.textContent = contributor.textContent.trim();
                }
                attribution.remove();
            }

            footer.appendChild(centerSpan);
            footer.appendChild(btn);
            recipeContainer.appendChild(footer);
        } else {
            // Non-recipe pages: right-aligned toggle at the bottom of the main container
            var container = document.querySelector('.index, .shopping-list, .upload-page, .request-page, .admin-page');
            if (!container) container = document.body;

            var footer = document.createElement('div');
            footer.className = 'page-footer page-footer-end';
            footer.appendChild(btn);
            container.appendChild(footer);
        }
    }

    buildFooter();

    // Update icon when OS preference changes (relevant when no saved preference)
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    if (mql.addEventListener) {
        mql.addEventListener('change', function () {
            var btn = document.querySelector('.theme-toggle');
            if (btn) updateToggle(btn);
        });
    }
})();
