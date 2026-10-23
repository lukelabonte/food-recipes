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

    // recipes.json stores URLs with .html; DOM cards use extensionless clean URLs
    function cleanUrl(url) { return url.replace(/\.html$/, ''); }

    // --- Shopping list state ---
    var STORAGE_KEY = 'shopping-list-recipes';
    var selectedRecipes = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    var shoppingLink, shoppingLinkCount;

    function makeCartIcon() {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('stroke-width', '1.5');
        svg.setAttribute('stroke', 'currentColor');
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('d', 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z');
        svg.appendChild(path);
        return svg;
    }

    function addCardActions(entry, url) {
        var actions = document.createElement('div');
        actions.className = 'recipe-card-actions';

        var addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'card-cart-btn';
        addButton.textContent = 'Add to shopping list';
        addButton.appendChild(makeCartIcon());
        addButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleRecipe(url, true, entry);
        });

        var addedLabel = document.createElement('span');
        addedLabel.className = 'shopping-added-label';
        addedLabel.textContent = '\u2713 Added to shopping list';

        var removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'shopping-remove-btn';
        removeButton.textContent = 'Remove';
        var card = entry.querySelector('.recipe-card');
        var title = card && card.querySelector('.recipe-card-title');
        var recipeName = title ? title.textContent : 'recipe';
        removeButton.setAttribute('aria-label', 'Remove ' + recipeName + ' from shopping list');
        removeButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleRecipe(url, false, entry);
        });

        var viewLink = document.createElement('a');
        viewLink.href = 'shopping-list';
        viewLink.className = 'shopping-view-link';
        viewLink.textContent = 'View shopping list';

        actions.appendChild(addButton);
        actions.appendChild(addedLabel);
        actions.appendChild(removeButton);
        actions.appendChild(viewLink);
        entry.appendChild(actions);
        updateCardActions(entry, selectedRecipes.has(url));
    }

    function updateCardActions(entry, isAdded) {
        var addButton = entry.querySelector('.card-cart-btn');
        var addedLabel = entry.querySelector('.shopping-added-label');
        var removeButton = entry.querySelector('.shopping-remove-btn');
        var viewLink = entry.querySelector('.shopping-view-link');
        if (addButton) addButton.hidden = isAdded;
        if (addedLabel) addedLabel.hidden = !isAdded;
        if (removeButton) removeButton.hidden = !isAdded;
        if (viewLink) viewLink.hidden = !isAdded;
    }

    function wrapCard(card, url) {
        var entry = document.createElement('div');
        entry.className = 'recipe-card-entry';
        entry.setAttribute('data-recipe-url', url);
        card.parentNode.insertBefore(entry, card);
        entry.appendChild(card);
        addCardActions(entry, url);
        return entry;
    }

    function toggleRecipe(url, add, focusedEntry) {
        if (add) selectedRecipes.add(url);
        else selectedRecipes.delete(url);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selectedRecipes)));

        // Sync all cards with this URL (same recipe appears in "Recently Added" + category)
        document.querySelectorAll('.recipe-card-entry').forEach(function(entry) {
            if (entry.getAttribute('data-recipe-url') === url) updateCardActions(entry, add);
        });
        updateShoppingLink();

        if (focusedEntry) {
            var focusTarget = focusedEntry.querySelector(add ? '.shopping-view-link' : '.card-cart-btn');
            if (focusTarget) focusTarget.focus({ preventScroll: true });
        }
    }

    function updateShoppingLink() {
        if (!shoppingLink) return;
        var count = selectedRecipes.size;
        shoppingLinkCount.textContent = String(count);
        shoppingLink.setAttribute('aria-label', 'Shopping list, ' + count + (count === 1 ? ' recipe' : ' recipes'));
    }

    window.addEventListener('pageshow', function() {
        selectedRecipes = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
        document.querySelectorAll('.recipe-card-entry').forEach(function(entry) {
            updateCardActions(entry, selectedRecipes.has(entry.getAttribute('data-recipe-url')));
        });
        updateShoppingLink();
    });

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
                var entry = card.parentNode.classList.contains('recipe-card-entry') ? card.parentNode : card;
                entry.style.display = hidden ? 'none' : '';
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
            var entry = card.parentNode.classList.contains('recipe-card-entry') ? card.parentNode : card;
            entry.style.display = (!isNaN(t) && t > maxMinutes) ? 'none' : '';
        });
    }

    // Keep the shopping list reachable while recipes.json or Fuse is loading or unavailable.
    var indexWrapper = document.querySelector('.index');
    var headerCard = indexWrapper && indexWrapper.querySelector('.header-card');
    if (headerCard) {
        shoppingLink = document.createElement('a');
        shoppingLink.href = 'shopping-list';
        shoppingLink.className = 'shopping-link';
        shoppingLink.appendChild(document.createTextNode('Shopping list ('));
        shoppingLinkCount = document.createElement('span');
        shoppingLinkCount.className = 'shopping-link-count';
        shoppingLink.appendChild(shoppingLinkCount);
        shoppingLink.appendChild(document.createTextNode(')'));
        headerCard.appendChild(shoppingLink);
        updateShoppingLink();
    }

    document.querySelectorAll('#default-content .recipe-card').forEach(function(card) {
        var href = card.getAttribute('href');
        if (href) wrapCard(card, href);
    });

    fetch('assets/recipes.json')
        .then(function(r) { return r.json(); })
        .then(function(recipes) {
            fuse = new Fuse(recipes, {
                keys: [
                    { name: 'title', weight: 0.5 },
                    { name: 'description', weight: 0.25 },
                    { name: 'ingredients', weight: 0.1 },
                    { name: 'category', weight: 0.08 },
                    { name: 'method', weight: 0.04 },
                    { name: 'addedBy', weight: 0.03 }
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
                    timeMap[cleanUrl(r.url)] = r.timeMinutes;
                    if (r.timeMinutes < minTime) minTime = r.timeMinutes;
                    if (r.timeMinutes > maxTime) maxTime = r.timeMinutes;
                }
            });

            // Build contributor map
            var contributorMap = {};
            recipes.forEach(function(r) {
                if (r.addedBy) contributorMap[cleanUrl(r.url)] = r.addedBy;
            });

            // Annotate existing static cards with data-time-minutes and contributor
            document.querySelectorAll('#default-content .recipe-card').forEach(function(card) {
                var href = card.getAttribute('href');
                if (href && timeMap[href] !== undefined) {
                    card.setAttribute('data-time-minutes', timeMap[href]);
                }
                if (href && contributorMap[href]) {
                    var meta = card.querySelector('.recipe-card-meta');
                    if (meta && !meta.querySelector('.card-contributor')) {
                        // Wrap existing spans in a left container
                        var left = document.createElement('span');
                        left.className = 'recipe-card-meta-left';
                        while (meta.firstChild) left.appendChild(meta.firstChild);
                        meta.appendChild(left);
                        // Add right-aligned contributor
                        var contrib = document.createElement('span');
                        contrib.className = 'card-contributor';
                        contrib.textContent = 'By ' + contributorMap[href];
                        meta.appendChild(contrib);
                    }
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

            // --- Upload control ---
            if (indexWrapper) {
                if (headerCard) {
                    headerCard.style.position = 'relative';

                    // Upload button (top-left corner)
                    var uploadBtn = document.createElement('a');
                    uploadBtn.href = 'upload';
                    uploadBtn.className = 'upload-toggle';
                    uploadBtn.setAttribute('aria-label', 'Upload a recipe');
                    var uploadSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    uploadSvg.setAttribute('width', '18');
                    uploadSvg.setAttribute('height', '18');
                    uploadSvg.setAttribute('viewBox', '0 0 24 24');
                    uploadSvg.setAttribute('fill', 'none');
                    uploadSvg.setAttribute('stroke', 'currentColor');
                    uploadSvg.setAttribute('stroke-width', '2');
                    uploadSvg.setAttribute('stroke-linecap', 'round');
                    uploadSvg.setAttribute('stroke-linejoin', 'round');
                    var path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path1.setAttribute('d', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4');
                    var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                    poly.setAttribute('points', '17 8 12 3 7 8');
                    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', '12'); line.setAttribute('y1', '3');
                    line.setAttribute('x2', '12'); line.setAttribute('y2', '15');
                    uploadSvg.appendChild(path1);
                    uploadSvg.appendChild(poly);
                    uploadSvg.appendChild(line);
                    uploadBtn.appendChild(uploadSvg);
                    headerCard.appendChild(uploadBtn);
                }
            }
        })
        .catch(function() {
            input.placeholder = 'Search coming soon...';
            input.disabled = true;
        });

    function buildCard(recipe) {
        var a = document.createElement('a');
        a.href = cleanUrl(recipe.url);
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

        var metaLeft = document.createElement('span');
        metaLeft.className = 'recipe-card-meta-left';

        var servingsText = recipe.servings ? recipe.servings + (recipe.servings === '1' ? ' serving' : ' servings') : '';
        [recipe.time, servingsText, recipe.method].forEach(function(text) {
            if (text) {
                var span = document.createElement('span');
                span.textContent = text;
                metaLeft.appendChild(span);
            }
        });
        meta.appendChild(metaLeft);

        if (recipe.addedBy) {
            var contributor = document.createElement('span');
            contributor.className = 'card-contributor';
            contributor.textContent = 'By ' + recipe.addedBy;
            meta.appendChild(contributor);
        }

        content.appendChild(title);
        content.appendChild(desc);
        content.appendChild(meta);

        var chevron = document.createElement('span');
        chevron.className = 'recipe-card-chevron';
        chevron.textContent = '\u203A';

        if (recipe.hasPhoto && recipe.photoUrl) {
            var photo = document.createElement('img');
            photo.className = 'recipe-card-photo';
            photo.src = recipe.photoUrl;
            photo.alt = '';
            photo.loading = 'lazy';
            a.appendChild(photo);
        }
        a.appendChild(content);
        a.appendChild(chevron);
        var entry = document.createElement('div');
        entry.className = 'recipe-card-entry';
        entry.setAttribute('data-recipe-url', cleanUrl(recipe.url));
        entry.appendChild(a);
        addCardActions(entry, cleanUrl(recipe.url));
        return entry;
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
