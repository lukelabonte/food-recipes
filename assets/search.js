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

    function addCartToggle(card, url) {
        var btn = document.createElement('button');
        btn.className = 'card-cart-btn';
        if (selectedRecipes.has(url)) btn.classList.add('active');
        btn.setAttribute('aria-label', selectedRecipes.has(url) ? 'Remove from shopping list' : 'Add to shopping list');
        btn.appendChild(makeCartIcon());

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var inList = selectedRecipes.has(url);
            toggleRecipe(url, !inList);
        });

        // Append to the meta row (after contributor)
        var meta = card.querySelector('.recipe-card-meta');
        if (meta) {
            meta.appendChild(btn);
        }
    }

    function toggleRecipe(url, add) {
        if (add) selectedRecipes.add(url);
        else selectedRecipes.delete(url);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selectedRecipes)));

        // Sync all cards with this URL (same recipe appears in "Recently Added" + category)
        document.querySelectorAll('.recipe-card[href="' + url + '"]').forEach(function(card) {
            var cartBtn = card.querySelector('.card-cart-btn');
            if (cartBtn) {
                cartBtn.classList.toggle('active', add);
                cartBtn.setAttribute('aria-label', add ? 'Remove from shopping list' : 'Add to shopping list');
            }
        });
        updateShoppingLink();
    }

    function updateShoppingLink() {
        if (!shoppingLink) return;
        var count = selectedRecipes.size;
        shoppingLink.classList.toggle('visible', count > 0);
        shoppingLinkCount.textContent = String(count);
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

            // --- Shopping list: per-card cart toggles + shopping link ---
            var indexWrapper = document.querySelector('.index');
            if (indexWrapper) {
                // Add cart toggle to all static cards
                document.querySelectorAll('#default-content .recipe-card').forEach(function(card) {
                    var href = card.getAttribute('href');
                    if (href) addCartToggle(card, href);
                });

                var headerCard = indexWrapper.querySelector('.header-card');
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

                    // Inline shopping link (visible when selections exist)
                    shoppingLink = document.createElement('a');
                    shoppingLink.href = 'shopping-list';
                    shoppingLink.className = 'shopping-link';
                    shoppingLink.setAttribute('aria-label', 'View shopping list');
                    var cartSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    cartSvg.setAttribute('fill', 'none');
                    cartSvg.setAttribute('viewBox', '0 0 24 24');
                    cartSvg.setAttribute('stroke-width', '1.5');
                    cartSvg.setAttribute('stroke', 'currentColor');
                    cartSvg.setAttribute('width', '16');
                    cartSvg.setAttribute('height', '16');
                    var cartPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    cartPath.setAttribute('stroke-linecap', 'round');
                    cartPath.setAttribute('stroke-linejoin', 'round');
                    cartPath.setAttribute('d', 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z');
                    cartSvg.appendChild(cartPath);
                    shoppingLink.appendChild(cartSvg);
                    shoppingLinkCount = document.createElement('span');
                    shoppingLinkCount.className = 'shopping-link-count';
                    shoppingLink.appendChild(shoppingLinkCount);
                    headerCard.appendChild(shoppingLink);
                    updateShoppingLink();
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
        if (recipe.url) addCartToggle(a, cleanUrl(recipe.url));
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
