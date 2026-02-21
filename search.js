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
