(function() {
    var RECIPES_KEY = 'shopping-list-recipes';
    var CHECKED_KEY = 'shopping-list-checked';
    var container = document.getElementById('shopping-list-content');
    var emptyState = document.getElementById('shopping-list-empty');
    var recipeCountEl = document.getElementById('shopping-recipe-count');
    var clearBtn = document.getElementById('shopping-clear');
    if (!container) return;

    var selectedUrls = JSON.parse(localStorage.getItem(RECIPES_KEY) || '[]');
    var checkedItems = JSON.parse(localStorage.getItem(CHECKED_KEY) || '{}');

    // --- Clear list button ---
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            localStorage.removeItem(RECIPES_KEY);
            localStorage.removeItem(CHECKED_KEY);
            window.location.href = 'index.html';
        });
    }

    if (selectedUrls.length === 0) {
        showEmpty();
        return;
    }

    function showEmpty() {
        container.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        if (clearBtn) clearBtn.style.display = 'none';
    }

    // --- Quantity parsing (duplicated from recipe.js — no bundler) ---

    var FRAC_MAP = {
        '\u00bd': 1/2, '\u2153': 1/3, '\u2154': 2/3,
        '\u00bc': 1/4, '\u00be': 3/4,
        '\u2155': 1/5, '\u2156': 2/5, '\u2157': 3/5, '\u2158': 4/5,
        '\u2159': 1/6, '\u215a': 5/6,
        '\u215b': 1/8, '\u215c': 3/8, '\u215d': 5/8, '\u215e': 7/8
    };
    var FRAC_CHARS = Object.keys(FRAC_MAP).join('');

    var FRAC_DISPLAY = [
        [7/8, '\u215e'], [5/6, '\u215a'], [4/5, '\u2158'], [3/4, '\u00be'],
        [5/8, '\u215d'], [3/5, '\u2157'], [2/3, '\u2154'], [1/2, '\u00bd'],
        [2/5, '\u2156'], [3/8, '\u215c'], [1/3, '\u2153'], [1/4, '\u00bc'],
        [1/5, '\u2155'], [1/6, '\u2159'], [1/8, '\u215b']
    ];

    function parseLeadingQty(text) {
        var t = text.trim();
        var m;
        m = t.match(new RegExp('^(\\d+)([' + FRAC_CHARS + '])'));
        if (m) return { value: parseInt(m[1], 10) + FRAC_MAP[m[2]], end: m[0].length };
        m = t.match(new RegExp('^([' + FRAC_CHARS + '])'));
        if (m) return { value: FRAC_MAP[m[1]], end: m[0].length };
        m = t.match(/^(\d+)\s+(\d+)\/(\d+)/);
        if (m) return { value: parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10), end: m[0].length };
        m = t.match(/^(\d+)\/(\d+)/);
        if (m) return { value: parseInt(m[1], 10) / parseInt(m[2], 10), end: m[0].length };
        m = t.match(/^(\d+(?:\.\d+)?)/);
        if (m) return { value: parseFloat(m[1]), end: m[0].length };
        return null;
    }

    function formatQty(value) {
        if (value <= 0) return '0';
        var bestFrac = null;
        var bestDist = Infinity;
        var maxWhole = Math.ceil(value) + 1;
        for (var w = 0; w <= maxWhole; w++) {
            if (w > 0) {
                var dist = Math.abs(value - w);
                if (dist < bestDist) { bestDist = dist; bestFrac = { whole: w, frac: -1 }; }
            }
            for (var i = 0; i < FRAC_DISPLAY.length; i++) {
                var candidate = w + FRAC_DISPLAY[i][0];
                var dist = Math.abs(value - candidate);
                if (dist < bestDist) { bestDist = dist; bestFrac = { whole: w, frac: i }; }
            }
        }
        var tolerance = Math.max(value * 0.15, 0.05);
        if (bestFrac && bestDist <= tolerance) {
            if (bestFrac.frac === -1) return String(bestFrac.whole);
            var fracChar = FRAC_DISPLAY[bestFrac.frac][1];
            return bestFrac.whole > 0 ? bestFrac.whole + fracChar : fracChar;
        }
        var rounded = Math.round(value * 10) / 10;
        return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
    }

    // --- Unit normalization ---

    var UNIT_MAP = {
        'cup': 'cup', 'cups': 'cup',
        'tablespoon': 'tbsp', 'tablespoons': 'tbsp', 'tbsp': 'tbsp',
        'teaspoon': 'tsp', 'teaspoons': 'tsp', 'tsp': 'tsp',
        'lb': 'lb', 'lbs': 'lb', 'pound': 'lb', 'pounds': 'lb',
        'oz': 'oz', 'ounce': 'oz', 'ounces': 'oz',
        'can': 'can', 'cans': 'can',
        'clove': 'clove', 'cloves': 'clove',
        'stalk': 'stalk', 'stalks': 'stalk',
        'slice': 'slice', 'slices': 'slice',
        'bunch': 'bunch', 'bunches': 'bunch',
        'pkg': 'pkg', 'package': 'pkg', 'packages': 'pkg'
    };

    var PLURALS = {
        cup: 'cups', tbsp: 'tbsp', tsp: 'tsp', lb: 'lbs', oz: 'oz',
        can: 'cans', clove: 'cloves', stalk: 'stalks', slice: 'slices',
        bunch: 'bunches', pkg: 'pkgs'
    };

    function normalizeUnit(word) {
        var lower = word.toLowerCase().replace(/\.$/, '');
        return UNIT_MAP.hasOwnProperty(lower) ? UNIT_MAP[lower] : null;
    }

    function pluralizeUnit(unit, qty) {
        if (qty <= 1) return unit;
        return PLURALS[unit] || unit;
    }

    // --- Name normalization ---

    function normalizeName(str) {
        return str.toLowerCase()
            .replace(/,.*$/, '')           // strip prep text after comma
            .replace(/\s*\(.*?\)\s*/g, '') // strip parentheticals
            .trim();
    }

    // Strip prep instructions for shopping-friendly display.
    // "garlic chives, cut into 2-inch pieces" → "garlic chives"
    // "rice noodles, soaked in room-temperature water for 1 hour" → "rice noodles"
    // "pressed tofu, cut into small pieces" → "pressed tofu"
    function stripPrepText(str) {
        return str
            .replace(/,\s*(cut |chopped|diced|minced|sliced|peeled|trimmed|soaked|grated|shredded|crushed|julienned|halved|quartered|melted|softened|divided|sifted|beaten|whisked|thawed|room[- ]temperature|at room temp).*$/i, '')
            .replace(/,\s*(to taste|for (garnish|serving|topping|frying|drizzling)).*$/i, '')
            .trim();
    }

    // --- Ingredient parser ---

    function parseIngredient(str) {
        // Strip gram weight suffix: "(125 g)" or "(~250 g)"
        var text = str.replace(/\s*\(?~?\d[\d,]*(?:\.\d+)?\s*g\)?\s*$/, '').trim();
        var qty = null, qty2 = null, unit = '', name = text, displayName = text;

        var parsed = parseLeadingQty(text);
        if (parsed) {
            qty = parsed.value;
            var rest = text.substring(parsed.end).trim();

            // Check for range (en-dash or hyphen between two numbers)
            var rangeMatch = rest.match(/^[–\-]\s*/);
            if (rangeMatch) {
                var afterDash = rest.substring(rangeMatch[0].length);
                var second = parseLeadingQty(afterDash);
                if (second && second.value > qty) {
                    qty2 = second.value;
                    rest = afterDash.substring(second.end).trim();
                }
            }

            // Parse unit (first word, check against UNIT_MAP)
            var unitMatch = rest.match(/^(\S+)\s*/);
            if (unitMatch) {
                var normalized = normalizeUnit(unitMatch[1]);
                if (normalized !== null) {
                    unit = normalized;
                    displayName = stripPrepText(rest.substring(unitMatch[0].length).trim());
                    name = normalizeName(displayName);
                } else {
                    displayName = stripPrepText(rest);
                    name = normalizeName(rest);
                }
            } else {
                displayName = stripPrepText(rest);
                name = normalizeName(rest);
            }
        } else {
            displayName = stripPrepText(text);
            name = normalizeName(text);
        }

        return { qty: qty, qty2: qty2, unit: unit, name: name, displayName: displayName, raw: str };
    }

    // --- Smart merge ---

    function mergeIngredients(allParsed) {
        var merged = {};
        var noQtyItems = [];

        allParsed.forEach(function(item) {
            if (item.qty === null) {
                var existing = null;
                for (var i = 0; i < noQtyItems.length; i++) {
                    if (normalizeName(noQtyItems[i].raw) === normalizeName(item.raw)) {
                        existing = noQtyItems[i]; break;
                    }
                }
                if (existing) {
                    if (!existing.sources) existing.sources = [existing.source];
                    if (existing.sources.indexOf(item.source) === -1) {
                        existing.sources.push(item.source);
                    }
                } else {
                    noQtyItems.push(item);
                }
                return;
            }

            var key = item.name + '|' + item.unit;
            if (merged[key]) {
                merged[key].qty += item.qty;
                if (item.qty2 !== null) {
                    merged[key].qty2 = (merged[key].qty2 || 0) + item.qty2;
                }
                if (merged[key].sources.indexOf(item.source) === -1) {
                    merged[key].sources.push(item.source);
                }
            } else {
                merged[key] = {
                    qty: item.qty, qty2: item.qty2, unit: item.unit,
                    name: item.name, displayName: item.displayName,
                    sources: [item.source], key: key, raw: item.raw
                };
            }
        });

        var result = Object.keys(merged).map(function(k) { return merged[k]; });
        // Add no-qty items with a stable key
        noQtyItems.forEach(function(item) {
            item.key = 'noqty|' + normalizeName(item.raw);
            item.sources = item.sources || [item.source];
            result.push(item);
        });
        return result;
    }

    // --- Store section categorization ---

    var STORE_SECTIONS = [
        { name: 'Produce', icon: '\uD83E\uDD6C', keywords: ['onion', 'garlic', 'ginger', 'carrot', 'celery',
            'potato', 'tomato', 'zucchini', 'spinach', 'cilantro', 'scallion', 'chive',
            'bean sprout', 'green bean', 'lime', 'lemon', 'bell pepper', 'jalape',
            'lettuce', 'avocado', 'cucumber', 'mushroom', 'broccoli', 'corn', 'basil leaves'] },
        { name: 'Meat & Seafood', icon: '\uD83E\uDD69', keywords: ['chicken', 'beef', 'pork', 'ham', 'ground beef',
            'shrimp', 'fish', 'salmon', 'turkey', 'bacon', 'sausage', 'tofu'] },
        { name: 'Dairy & Eggs', icon: '\uD83E\uDD5B', keywords: ['milk', 'butter', 'cheese', 'cream', 'yogurt',
            'egg', 'sour cream', 'parmesan', 'mozzarella', 'cheddar'] },
        { name: 'Baking', icon: '\uD83E\uDDC1', keywords: ['flour', 'sugar', 'baking soda', 'baking powder',
            'cocoa', 'chocolate', 'cornstarch', 'bisquick', 'brown sugar', 'powdered sugar', 'yeast'] },
        { name: 'Spices & Seasonings', icon: '\uD83E\uDDC2', keywords: ['salt', 'pepper', 'cumin', 'paprika',
            'cinnamon', 'nutmeg', 'oregano', 'basil', 'thyme', 'chili powder', 'taco seasoning',
            'sesame oil', 'fish sauce', 'soy sauce', 'vanilla', 'espresso powder', 'dried',
            'cayenne', 'turmeric', 'coriander'] },
        { name: 'Canned & Jarred', icon: '\uD83E\uDD6B', keywords: ['can ', 'canned', 'broth', 'tomato sauce',
            'paste', 'bean sauce', 'tamarind', 'palm sugar', 'stock'] },
        { name: 'Pasta & Grains', icon: '\uD83C\uDF5D', keywords: ['pasta', 'noodle', 'rice', 'macaroni',
            'spaghetti', 'egg noodle', 'rice noodle', 'bread', 'tortilla'] },
        { name: 'Other', icon: '\uD83D\uDCE6', keywords: [] }
    ];

    function categorizeIngredient(name) {
        var lower = name.toLowerCase();
        for (var i = 0; i < STORE_SECTIONS.length - 1; i++) {
            var section = STORE_SECTIONS[i];
            for (var j = 0; j < section.keywords.length; j++) {
                if (lower.indexOf(section.keywords[j]) !== -1) return section.name;
            }
        }
        return 'Other';
    }

    // --- Display formatting ---

    function formatItemDisplay(item) {
        if (item.qty === null) return item.raw;
        var qtyStr = formatQty(item.qty);
        if (item.qty2 !== null) qtyStr += '\u2013' + formatQty(item.qty2);
        var unitStr = item.unit ? ' ' + pluralizeUnit(item.unit, item.qty) + ' ' : ' ';
        return qtyStr + unitStr + item.displayName;
    }

    // --- DOM helper: create a span with class and text ---

    function makeSpan(className, text) {
        var span = document.createElement('span');
        span.className = className;
        span.textContent = text;
        return span;
    }

    // --- Fetch and render ---

    fetch('recipes.json')
        .then(function(r) { return r.json(); })
        .then(function(allRecipes) {
            var recipes = allRecipes.filter(function(r) {
                return selectedUrls.indexOf(r.url) !== -1;
            });

            if (recipes.length === 0) {
                showEmpty();
                return;
            }

            // Update recipe count
            if (recipeCountEl) {
                recipeCountEl.textContent = recipes.length + (recipes.length === 1 ? ' recipe' : ' recipes');
            }

            // Parse all ingredients
            var allParsed = [];
            recipes.forEach(function(recipe) {
                if (!recipe.ingredients) return;
                // recipes.json stores ingredients as an array of strings
                var ingList = Array.isArray(recipe.ingredients)
                    ? recipe.ingredients
                    : recipe.ingredients.split('\n');
                ingList.forEach(function(line) {
                    var trimmed = line.trim();
                    if (!trimmed) return;
                    var parsed = parseIngredient(trimmed);
                    parsed.source = recipe.title;
                    allParsed.push(parsed);
                });
            });

            // Merge duplicates
            var merged = mergeIngredients(allParsed);

            // Group by store section
            var sections = {};
            STORE_SECTIONS.forEach(function(s) { sections[s.name] = []; });
            merged.forEach(function(item) {
                var sectionName = categorizeIngredient(item.name || item.raw);
                sections[sectionName].push(item);
            });

            // Sort items within each section alphabetically
            Object.keys(sections).forEach(function(name) {
                sections[name].sort(function(a, b) {
                    var nameA = (a.displayName || a.raw).toLowerCase();
                    var nameB = (b.displayName || b.raw).toLowerCase();
                    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
                });
            });

            // Render recipe tag pills (linked to recipe pages)
            var tagRow = document.createElement('div');
            tagRow.className = 'shopping-recipe-list';
            recipes.forEach(function(recipe) {
                var tag = document.createElement('a');
                tag.className = 'shopping-recipe-tag';
                tag.href = recipe.url;
                tag.textContent = recipe.title;
                tagRow.appendChild(tag);
            });
            container.appendChild(tagRow);

            // Render store sections
            STORE_SECTIONS.forEach(function(section) {
                var items = sections[section.name];
                if (items.length === 0) return;

                var sectionEl = document.createElement('div');
                sectionEl.className = 'shopping-section';

                var header = document.createElement('button');
                header.className = 'shopping-section-header';
                header.setAttribute('aria-expanded', 'true');
                header.appendChild(makeSpan('shopping-section-icon', section.icon));
                header.appendChild(makeSpan('shopping-section-name', section.name));

                // "Check All" / "Uncheck All" button per section
                var checkAllBtn = document.createElement('button');
                checkAllBtn.type = 'button';
                checkAllBtn.className = 'shopping-section-check-all';
                checkAllBtn.textContent = 'Check All';
                header.appendChild(checkAllBtn);

                header.appendChild(makeSpan('shopping-section-count', String(items.length)));
                var chevron = makeSpan('shopping-section-chevron', '\u25BE');
                header.appendChild(chevron);

                var list = document.createElement('ul');
                list.className = 'shopping-section-list';

                // Track checkboxes in this section for "Check All"
                var sectionCheckboxes = [];

                items.forEach(function(item) {
                    var li = document.createElement('li');
                    li.className = 'shopping-item';
                    var key = item.key;

                    var checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'shopping-checkbox';
                    checkbox.checked = !!checkedItems[key];
                    if (checkbox.checked) li.classList.add('checked');

                    // Use a <label> wrapper so the entire row is tappable
                    var label = document.createElement('label');
                    label.className = 'shopping-item-label';

                    var detail = document.createElement('div');
                    detail.className = 'shopping-item-detail';

                    var textSpan = document.createElement('span');
                    textSpan.className = 'shopping-item-text';
                    textSpan.textContent = formatItemDisplay(item);
                    detail.appendChild(textSpan);

                    // Source attribution — always show which recipe(s) need this ingredient
                    if (item.sources && item.sources.length > 0) {
                        var sourceSpan = document.createElement('div');
                        sourceSpan.className = 'shopping-item-sources';
                        sourceSpan.textContent = item.sources.join(', ');
                        detail.appendChild(sourceSpan);
                    }

                    label.appendChild(checkbox);
                    label.appendChild(detail);
                    li.appendChild(label);

                    sectionCheckboxes.push({ checkbox: checkbox, li: li, key: key });

                    checkbox.addEventListener('change', function() {
                        li.classList.toggle('checked', checkbox.checked);
                        if (checkbox.checked) checkedItems[key] = true;
                        else delete checkedItems[key];
                        localStorage.setItem(CHECKED_KEY, JSON.stringify(checkedItems));
                        updateCheckAllLabel();
                    });

                    list.appendChild(li);
                });

                // Update "Check All" / "Uncheck All" label based on state
                function updateCheckAllLabel() {
                    var allChecked = sectionCheckboxes.every(function(s) { return s.checkbox.checked; });
                    checkAllBtn.textContent = allChecked ? 'Uncheck All' : 'Check All';
                }
                updateCheckAllLabel();

                // Handle "Check All" click — stop propagation so section doesn't collapse
                checkAllBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var allChecked = sectionCheckboxes.every(function(s) { return s.checkbox.checked; });
                    var newState = !allChecked;
                    sectionCheckboxes.forEach(function(s) {
                        s.checkbox.checked = newState;
                        s.li.classList.toggle('checked', newState);
                        if (newState) checkedItems[s.key] = true;
                        else delete checkedItems[s.key];
                    });
                    localStorage.setItem(CHECKED_KEY, JSON.stringify(checkedItems));
                    updateCheckAllLabel();
                });

                // Collapsible section toggle
                header.addEventListener('click', function() {
                    var expanded = header.getAttribute('aria-expanded') === 'true';
                    header.setAttribute('aria-expanded', String(!expanded));
                    list.style.display = expanded ? 'none' : '';
                    chevron.textContent = expanded ? '\u25B8' : '\u25BE';
                });

                sectionEl.appendChild(header);
                sectionEl.appendChild(list);
                container.appendChild(sectionEl);
            });
        })
        .catch(function() {
            showEmpty();
        });
})();
