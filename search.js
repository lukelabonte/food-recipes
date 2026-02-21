(function() {
    var input = document.getElementById('search-input');
    var clearBtn = document.getElementById('search-clear');
    var defaultContent = document.getElementById('default-content');
    var searchResults = document.getElementById('search-results');
    var noResults = document.getElementById('no-results');
    var fuse = null;
    var currentMaxTime = Infinity;

    // Bail out if elements aren't present (e.g., index.html not updated yet)
    if (!input || !defaultContent) return;

    // --- Shopping list selection state ---
    var STORAGE_KEY = 'shopping-list-recipes';
    var selectedRecipes = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    var fab, fabCount;
    var updateClearAll = function() {}; // set once toggle is built

    function addCheckbox(card, url) {
        var label = document.createElement('label');
        label.className = 'recipe-select';
        label.setAttribute('aria-label', 'Add to shopping list');

        var checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'recipe-select-checkbox';
        checkbox.checked = selectedRecipes.has(url);

        var box = document.createElement('span');
        box.className = 'recipe-select-box';

        label.appendChild(checkbox);
        label.appendChild(box);

        // Prevent click from navigating the parent <a> tag
        label.addEventListener('click', function(e) { e.stopPropagation(); });
        label.addEventListener('mousedown', function(e) { e.stopPropagation(); });
        checkbox.addEventListener('change', function() {
            toggleRecipe(url, checkbox.checked);
        });

        // In selection mode, clicking anywhere on the card toggles the checkbox
        card.addEventListener('click', function(e) {
            if (!card.closest('.selecting')) return; // browse mode — let link navigate
            e.preventDefault();
            checkbox.checked = !checkbox.checked;
            toggleRecipe(url, checkbox.checked);
        });

        card.insertBefore(label, card.firstChild);
        if (checkbox.checked) card.classList.add('selected');
    }

    function toggleRecipe(url, checked) {
        if (checked) selectedRecipes.add(url);
        else selectedRecipes.delete(url);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selectedRecipes)));

        // Sync all cards with this URL (same recipe appears in "Recently Added" + category)
        document.querySelectorAll('.recipe-card[href="' + url + '"]').forEach(function(card) {
            var cb = card.querySelector('.recipe-select-checkbox');
            if (cb) cb.checked = checked;
            card.classList.toggle('selected', checked);
        });
        updateFab();
        updateClearAll();
    }

    function updateFab() {
        if (!fab) return;
        var count = selectedRecipes.size;
        fab.classList.toggle('visible', count > 0);
        fabCount.textContent = count > 0 ? 'Shopping List (' + count + ')' : '';
    }

    function formatTime(minutes) {
        if (minutes >= 60) {
            var hrs = Math.floor(minutes / 60);
            var mins = minutes % 60;
            return mins > 0 ? hrs + ' hr ' + mins + ' min' : hrs + ' hr';
        }
        return minutes + ' min';
    }

    function applyTimeFilter() {
        var maxMinutes = currentMaxTime;

        // Filter default-view cards
        // Cards without data-time-minutes (unparseable time) are always shown
        var sections = document.querySelectorAll('#default-content .category-section');
        sections.forEach(function(section) {
            var cards = section.querySelectorAll('.recipe-card');
            var visibleCount = 0;
            cards.forEach(function(card) {
                var t = parseInt(card.getAttribute('data-time-minutes'), 10);
                var hidden = !isNaN(t) && t > maxMinutes;
                card.style.display = hidden ? 'none' : '';
                if (!hidden) visibleCount++;
            });

            // Update category count and hide empty sections
            var countEl = section.querySelector('.category-count');
            if (countEl) {
                countEl.textContent = visibleCount + (visibleCount === 1 ? ' recipe' : ' recipes');
            }
            // Hide section if no visible cards (but not "Recently Added")
            var details = section.querySelector('details');
            if (details) {
                details.style.display = visibleCount === 0 ? 'none' : '';
            }
            // Handle "Recently Added" — hide section label if no visible cards
            var sectionLabel = section.querySelector('.section-label');
            if (sectionLabel && !details) {
                sectionLabel.style.display = visibleCount === 0 ? 'none' : '';
            }
        });

        // Filter search results too (if active)
        var searchCards = searchResults.querySelectorAll('.recipe-card');
        searchCards.forEach(function(card) {
            var t = parseInt(card.getAttribute('data-time-minutes'), 10);
            card.style.display = (!isNaN(t) && t > maxMinutes) ? 'none' : '';
        });
    }

    fetch('recipes.json')
        .then(function(r) { return r.json(); })
        .then(function(recipes) {
            fuse = new Fuse(recipes, {
                keys: [
                    { name: 'title', weight: 0.5 },
                    { name: 'description', weight: 0.25 },
                    { name: 'ingredients', weight: 0.1 },
                    { name: 'category', weight: 0.08 },
                    { name: 'method', weight: 0.04 }
                ],
                threshold: 0.2,
                ignoreLocation: true
            });

            // Build time map and annotate static cards
            var timeMap = {};
            var minTime = Infinity;
            var maxTime = 0;
            recipes.forEach(function(r) {
                if (r.timeMinutes) {
                    timeMap[r.url] = r.timeMinutes;
                    if (r.timeMinutes < minTime) minTime = r.timeMinutes;
                    if (r.timeMinutes > maxTime) maxTime = r.timeMinutes;
                }
            });

            // Annotate existing static cards with data-time-minutes
            document.querySelectorAll('#default-content .recipe-card').forEach(function(card) {
                var href = card.getAttribute('href');
                if (href && timeMap[href] !== undefined) {
                    card.setAttribute('data-time-minutes', timeMap[href]);
                }
            });

            // Build slider if we have time data
            if (maxTime > 0) {
                currentMaxTime = maxTime;
                var searchWrapper = document.querySelector('.search-wrapper');
                if (searchWrapper) {
                    var filter = document.createElement('div');
                    filter.className = 'time-filter';

                    var label = document.createElement('span');
                    label.className = 'time-filter-label';
                    label.textContent = 'Max time';

                    var slider = document.createElement('input');
                    slider.type = 'range';
                    slider.className = 'time-filter-slider';
                    slider.id = 'time-filter-slider';
                    slider.min = String(minTime);
                    slider.max = String(maxTime);
                    slider.step = '5';
                    slider.value = String(maxTime);
                    slider.setAttribute('aria-label', 'Maximum cooking time');

                    var valueDisplay = document.createElement('span');
                    valueDisplay.className = 'time-filter-value';
                    valueDisplay.textContent = 'Any';

                    filter.appendChild(label);
                    filter.appendChild(slider);
                    filter.appendChild(valueDisplay);

                    searchWrapper.parentNode.insertBefore(filter, searchWrapper.nextSibling);

                    slider.addEventListener('input', function() {
                        currentMaxTime = parseInt(slider.value, 10);
                        var label = currentMaxTime >= maxTime ? 'Any' : formatTime(currentMaxTime);
                        valueDisplay.textContent = label;
                        slider.setAttribute('aria-valuetext', label);
                        applyTimeFilter();
                    });
                }
            }

            // --- Shopping list: inject checkboxes + toggle + FAB ---
            var indexWrapper = document.querySelector('.index');
            if (indexWrapper) {
                // Inject checkboxes on all static cards (hidden until shopping mode)
                document.querySelectorAll('#default-content .recipe-card').forEach(function(card) {
                    var href = card.getAttribute('href');
                    if (href) addCheckbox(card, href);
                });

                // Shopping mode toggle (cart icon)
                function makeCartIcon() {
                    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.setAttribute('fill', 'none');
                    svg.setAttribute('viewBox', '0 0 24 24');
                    svg.setAttribute('stroke-width', '1.5');
                    svg.setAttribute('stroke', 'currentColor');
                    svg.setAttribute('width', '20');
                    svg.setAttribute('height', '20');
                    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('stroke-linecap', 'round');
                    path.setAttribute('stroke-linejoin', 'round');
                    path.setAttribute('d', 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z');
                    svg.appendChild(path);
                    return svg;
                }
                var selectToggle = document.createElement('button');
                selectToggle.className = 'shopping-toggle';
                selectToggle.setAttribute('aria-pressed', 'false');
                selectToggle.setAttribute('aria-label', 'Build shopping list');
                selectToggle.appendChild(makeCartIcon());

                // Clear all button (visible in selection mode when items selected)
                var clearAllBtn = document.createElement('button');
                clearAllBtn.className = 'shopping-clear-all';
                clearAllBtn.textContent = 'Clear All';

                clearAllBtn.addEventListener('click', function() {
                    selectedRecipes.clear();
                    localStorage.removeItem(STORAGE_KEY);
                    document.querySelectorAll('.recipe-card').forEach(function(card) {
                        var cb = card.querySelector('.recipe-select-checkbox');
                        if (cb) cb.checked = false;
                        card.classList.remove('selected');
                    });
                    updateFab();
                    updateClearAll();
                });

                updateClearAll = function() {
                    var show = indexWrapper.classList.contains('selecting') && selectedRecipes.size > 0;
                    clearAllBtn.style.display = show ? '' : 'none';
                };

                function makeCheckIcon() {
                    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.setAttribute('fill', 'none');
                    svg.setAttribute('viewBox', '0 0 24 24');
                    svg.setAttribute('stroke-width', '1.5');
                    svg.setAttribute('stroke', 'currentColor');
                    svg.setAttribute('width', '20');
                    svg.setAttribute('height', '20');
                    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('stroke-linecap', 'round');
                    path.setAttribute('stroke-linejoin', 'round');
                    path.setAttribute('d', 'm4.5 12.75 6 6 9-13.5');
                    svg.appendChild(path);
                    return svg;
                }

                selectToggle.addEventListener('click', function() {
                    var active = indexWrapper.classList.toggle('selecting');
                    selectToggle.setAttribute('aria-pressed', String(active));
                    selectToggle.setAttribute('aria-label', active ? 'Done selecting' : 'Build shopping list');
                    selectToggle.replaceChildren(active ? makeCheckIcon() : makeCartIcon());
                    selectToggle.classList.toggle('active', active);
                    updateClearAll();
                });

                // Insert toggle + clear into header card (top-right corner)
                var headerCard = indexWrapper.querySelector('.header-card');
                if (headerCard) {
                    headerCard.style.position = 'relative';
                    var toggleGroup = document.createElement('div');
                    toggleGroup.className = 'shopping-toggle-group';
                    toggleGroup.appendChild(selectToggle);
                    toggleGroup.appendChild(clearAllBtn);
                    headerCard.appendChild(toggleGroup);
                    updateClearAll();
                }

                // FAB (visible when selections exist, regardless of mode)
                fab = document.createElement('a');
                fab.href = 'shopping-list.html';
                fab.className = 'shopping-fab';
                fab.setAttribute('aria-label', 'View shopping list');
                fabCount = document.createElement('span');
                fabCount.className = 'shopping-fab-count';
                fab.appendChild(fabCount);
                indexWrapper.appendChild(fab);
                updateFab();
            }
        })
        .catch(function() {
            input.placeholder = 'Search coming soon...';
            input.disabled = true;
        });

    function buildCard(recipe) {
        var a = document.createElement('a');
        a.href = recipe.url;
        a.className = 'recipe-card';

        if (recipe.timeMinutes) {
            a.setAttribute('data-time-minutes', recipe.timeMinutes);
        }

        var content = document.createElement('div');
        content.className = 'recipe-card-content';

        var title = document.createElement('div');
        title.className = 'recipe-card-title';
        title.textContent = recipe.title;

        var desc = document.createElement('div');
        desc.className = 'recipe-card-desc';
        desc.textContent = recipe.description;

        var meta = document.createElement('div');
        meta.className = 'recipe-card-meta';

        var servingsText = recipe.servings ? recipe.servings + (recipe.servings === '1' ? ' serving' : ' servings') : '';
        [recipe.time, servingsText, recipe.method].forEach(function(text) {
            if (text) {
                var span = document.createElement('span');
                span.textContent = text;
                meta.appendChild(span);
            }
        });

        content.appendChild(title);
        content.appendChild(desc);
        content.appendChild(meta);

        var chevron = document.createElement('span');
        chevron.className = 'recipe-card-chevron';
        chevron.textContent = '\u203A';

        a.appendChild(content);
        a.appendChild(chevron);
        if (recipe.url) addCheckbox(a, recipe.url);
        return a;
    }

    input.addEventListener('input', function() {
        var query = input.value.trim();
        clearBtn.classList.toggle('visible', query.length > 0);

        if (!query || !fuse) {
            defaultContent.style.display = '';
            searchResults.style.display = 'none';
            noResults.style.display = 'none';
            searchResults.textContent = '';
            applyTimeFilter();
            return;
        }

        var results = fuse.search(query);
        defaultContent.style.display = 'none';

        if (results.length === 0) {
            searchResults.style.display = 'none';
            noResults.style.display = 'block';
            return;
        }

        noResults.style.display = 'none';
        searchResults.style.display = 'block';
        searchResults.textContent = '';
        results.forEach(function(r) {
            searchResults.appendChild(buildCard(r.item));
        });
        applyTimeFilter();
    });

    clearBtn.addEventListener('click', function() {
        input.value = '';
        input.dispatchEvent(new Event('input'));
        input.focus();
    });

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            input.value = '';
            input.dispatchEvent(new Event('input'));
            input.blur();
        }
    });
})();
