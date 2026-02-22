(function() {
    var updateScrollPadding = null;
    var prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var scrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    // --- Pill bar navigation ---
    var nav = document.querySelector('.recipe-nav');
    if (nav) {
        var pills = nav.querySelectorAll('.recipe-nav-pill');
        var sections = [];

        pills.forEach(function(pill) {
            var id = pill.getAttribute('href');
            if (id && id.charAt(0) === '#') {
                var el = document.getElementById(id.slice(1));
                if (el) sections.push({ pill: pill, el: el });
            }
        });

        // Smooth scroll on pill click
        var navHeight = nav.offsetHeight + 8;
        pills.forEach(function(pill) {
            pill.addEventListener('click', function(e) {
                var id = pill.getAttribute('href');
                if (id && id.charAt(0) === '#') {
                    var target = document.getElementById(id.slice(1));
                    if (target) {
                        e.preventDefault();
                        var top = target.getBoundingClientRect().top + window.pageYOffset - navHeight;
                        window.scrollTo({ top: top, behavior: scrollBehavior });
                    }
                }
            });
        });

        // Active pill highlighting via scroll position
        if (sections.length > 0) {
            var currentActive = null;

            function updateActivePill() {
                var scrollY = window.pageYOffset + navHeight + 30;
                var active = null;
                for (var i = sections.length - 1; i >= 0; i--) {
                    if (sections[i].el.offsetTop <= scrollY) {
                        active = i;
                        break;
                    }
                }
                if (active === null) active = 0;
                if (sections[active].pill !== currentActive) {
                    if (currentActive) currentActive.classList.remove('active');
                    sections[active].pill.classList.add('active');
                    currentActive = sections[active].pill;
                    sections[active].pill.scrollIntoView({ behavior: scrollBehavior, block: 'nearest', inline: 'nearest' });
                }
            }

            window.addEventListener('scroll', updateActivePill, { passive: true });
            updateActivePill();
        }

        // Ensure last section can scroll to nav position
        var recipe = nav.closest('.recipe');
        if (recipe && sections.length > 0) {
            updateScrollPadding = function() {
                recipe.style.paddingBottom = '0';
                var last = sections[sections.length - 1].el;
                var scrollNeeded = last.offsetTop - navHeight;
                var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
                var deficit = scrollNeeded - maxScroll;
                recipe.style.paddingBottom = deficit > 0 ? deficit + 'px' : '';
            };
            updateScrollPadding();
            window.addEventListener('resize', updateScrollPadding);
        }
    }

    // --- Ingredient substitutions ---
    var ingredientList = document.querySelector('.ingredient-list');
    if (ingredientList) {
        var subsItems = ingredientList.querySelectorAll('li[data-subs]');

        // Add a11y attributes and remove hidden (CSS handles visibility)
        subsItems.forEach(function(li) {
            li.setAttribute('tabindex', '0');
            li.setAttribute('role', 'button');
            li.setAttribute('aria-expanded', 'false');
            var sl = li.querySelector('.sub-list');
            if (sl) sl.removeAttribute('hidden');
        });

        function toggleSub(li) {
            var subList = li.querySelector('.sub-list');
            if (!subList) return;

            var isOpen = li.classList.toggle('open');
            li.setAttribute('aria-expanded', String(isOpen));

            if (updateScrollPadding) updateScrollPadding();
        }

        ingredientList.addEventListener('click', function(e) {
            var li = e.target.closest('li[data-subs]');
            if (!li || !ingredientList.contains(li)) return;
            if (e.target.closest('.sub-list')) return;
            toggleSub(li);
        });

        ingredientList.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var li = e.target.closest('li[data-subs]');
            if (!li || !ingredientList.contains(li)) return;
            if (e.target.closest('.sub-list')) return;
            e.preventDefault();
            toggleSub(li);
        });
    }

    // --- Source link relocation ---
    // Move source link into header card; keep contributor in attribution for footer use

    var sourceFooter = document.querySelector('.recipe-attribution');
    var headerCard = document.querySelector('.header-card');
    if (sourceFooter && headerCard) {
        var sourceLink = sourceFooter.querySelector('a');
        if (sourceLink) {
            var adapted = document.createElement('p');
            adapted.className = 'source-link';
            var a = document.createElement('a');
            a.href = sourceLink.href;
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = 'Adapted from ' + sourceLink.textContent;
            adapted.appendChild(a);
            headerCard.appendChild(adapted);

            // Preserve contributor for theme.js footer; remove only the source parts
            var contributor = sourceFooter.querySelector('.contributor');
            if (contributor) {
                contributor.textContent = contributor.textContent.replace(/^\s*·\s*/, '');
                sourceFooter.textContent = '';
                sourceFooter.appendChild(contributor);
            } else {
                sourceFooter.remove();
            }
        }
    }

    // --- Recipe scaling ---

    // Unicode fraction map
    var FRAC_MAP = {
        '\u00bd': 1/2, '\u2153': 1/3, '\u2154': 2/3,
        '\u00bc': 1/4, '\u00be': 3/4,
        '\u2155': 1/5, '\u2156': 2/5, '\u2157': 3/5, '\u2158': 4/5,
        '\u2159': 1/6, '\u215a': 5/6,
        '\u215b': 1/8, '\u215c': 3/8, '\u215d': 5/8, '\u215e': 7/8
    };
    var FRAC_CHARS = Object.keys(FRAC_MAP).join('');

    // Reverse map: value → unicode char (sorted largest-first for mixed number formatting)
    var FRAC_DISPLAY = [
        [7/8, '\u215e'], [5/6, '\u215a'], [4/5, '\u2158'], [3/4, '\u00be'],
        [5/8, '\u215d'], [3/5, '\u2157'], [2/3, '\u2154'], [1/2, '\u00bd'],
        [2/5, '\u2156'], [3/8, '\u215c'], [1/3, '\u2153'], [1/4, '\u00bc'],
        [1/5, '\u2155'], [1/6, '\u2159'], [1/8, '\u215b']
    ];

    // Parse a leading quantity from ingredient text.
    // Returns { value: number, end: index } or null.
    function parseLeadingQty(text) {
        var t = text.trim();
        var m;

        // Mixed number with unicode fraction: "2½"
        m = t.match(new RegExp('^(\\d+)([' + FRAC_CHARS + '])'));
        if (m) return { value: parseInt(m[1], 10) + FRAC_MAP[m[2]], end: m[0].length };

        // Unicode fraction alone: "½"
        m = t.match(new RegExp('^([' + FRAC_CHARS + '])'));
        if (m) return { value: FRAC_MAP[m[1]], end: m[0].length };

        // Mixed number with ASCII fraction: "3 1/2" (space between whole and fraction)
        m = t.match(/^(\d+)\s+(\d+)\/(\d+)/);
        if (m) return { value: parseInt(m[1], 10) + parseInt(m[2], 10) / parseInt(m[3], 10), end: m[0].length };

        // ASCII fraction alone: "1/2"
        m = t.match(/^(\d+)\/(\d+)/);
        if (m) return { value: parseInt(m[1], 10) / parseInt(m[2], 10), end: m[0].length };

        // Decimal or integer: "35", "2.5"
        m = t.match(/^(\d+(?:\.\d+)?)/);
        if (m) return { value: parseFloat(m[1]), end: m[0].length };

        return null;
    }

    // Check if a value snaps to a known cooking fraction (won't fall through to decimal).
    // Rejects values that would snap to 0 — "0 cups" is never a useful measurement.
    function fitsKnownFraction(value) {
        if (value <= 0) return true;
        var bestDist = Infinity;
        var bestIsZero = false;
        var maxWhole = Math.ceil(value) + 1;
        for (var w = 0; w <= maxWhole; w++) {
            // Skip w=0 with no fraction — snapping to "0" is never useful
            if (w > 0) {
                var dist = Math.abs(value - w);
                if (dist < bestDist) { bestDist = dist; bestIsZero = false; }
            }
            for (var i = 0; i < FRAC_DISPLAY.length; i++) {
                var dist = Math.abs(value - (w + FRAC_DISPLAY[i][0]));
                if (dist < bestDist) { bestDist = dist; bestIsZero = false; }
            }
        }
        return bestDist <= Math.max(value * 0.15, 0.05);
    }

    // Format a number as a friendly quantity string.
    // Snaps to the nearest practical cooking fraction for usability.
    function formatQty(value) {
        if (value <= 0) return '0';

        // Snap the entire value to the nearest common fraction (within cooking tolerance)
        // This prevents awkward decimals like "0.3 cup" — snaps to "¼ cup" instead
        var bestFrac = null;
        var bestDist = Infinity;
        // Check whole numbers and whole + fraction combinations
        var maxWhole = Math.ceil(value) + 1;
        for (var w = 0; w <= maxWhole; w++) {
            // Check whole number itself (skip 0 — "0 cups" is never useful)
            if (w > 0) {
                var dist = Math.abs(value - w);
                if (dist < bestDist) { bestDist = dist; bestFrac = { whole: w, frac: -1 }; }
            }
            // Check whole + each known fraction
            for (var i = 0; i < FRAC_DISPLAY.length; i++) {
                var candidate = w + FRAC_DISPLAY[i][0];
                dist = Math.abs(value - candidate);
                if (dist < bestDist) { bestDist = dist; bestFrac = { whole: w, frac: i }; }
            }
        }

        // Use fraction if snapping distance is within 15% of original value (cooking tolerance)
        var tolerance = Math.max(value * 0.15, 0.05);
        if (bestFrac && bestDist <= tolerance) {
            if (bestFrac.frac === -1) {
                return String(bestFrac.whole);
            }
            var fracChar = FRAC_DISPLAY[bestFrac.frac][1];
            return bestFrac.whole > 0 ? bestFrac.whole + fracChar : fracChar;
        }

        // Fallback: round to 1 decimal
        var rounded = Math.round(value * 10) / 10;
        return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
    }

    // Parse a gram value from text like "(125 g)" or "(2.5 g)".
    // Returns number or null.
    function parseGrams(text) {
        var m = text.match(/\(?\s*~?(\d[\d,]*(?:\.\d+)?)\s*g/);
        if (m) return parseFloat(m[1].replace(/,/g, ''));
        return null;
    }

    // Format a gram value for display.
    function formatGramsVal(value) {
        if (value >= 10) {
            var rounded = Math.round(value);
            return rounded >= 1000 ? rounded.toLocaleString() : String(rounded);
        }
        return (Math.round(value * 10) / 10).toFixed(1);
    }

    // --- Store original values ---

    // Find the servings <li> in the overview card
    function findServingsLi() {
        var metaItems = document.querySelectorAll('.meta-list li');
        for (var i = 0; i < metaItems.length; i++) {
            var strong = metaItems[i].querySelector('strong');
            if (strong && strong.textContent.trim().toLowerCase() === 'servings') {
                return metaItems[i];
            }
        }
        return null;
    }

    // Parse the original servings count. For ranges like "8–10", use lower bound.
    function parseServings(li) {
        var text = li.textContent.replace(li.querySelector('strong').textContent, '').trim();
        var m = text.match(/^(\d+)/);
        return m ? parseInt(m[1], 10) : null;
    }

    var servingsLi = findServingsLi();
    if (!servingsLi || !ingredientList) return;

    var originalServings = parseServings(servingsLi);
    if (!originalServings || originalServings < 1) return;

    var servingsFullText = servingsLi.textContent.replace(
        servingsLi.querySelector('strong').textContent, ''
    ).trim();
    var isRange = /\d+\s*[–\-]\s*\d+/.test(servingsFullText);
    var currentServings = originalServings;

    // Store original values on each ingredient <li>
    var ingredients = ingredientList.querySelectorAll(':scope > li');
    ingredients.forEach(function(li) {
        var textNodes = [];
        for (var i = 0; i < li.childNodes.length; i++) {
            var node = li.childNodes[i];
            if (node.nodeType === 3) textNodes.push(node);
        }
        var fullText = textNodes.map(function(n) { return n.textContent; }).join('');

        // Check for range pattern: "7–10" or "½–1½"
        var rangeMatch = fullText.trimStart().match(/^(.+?)\s*([–\-])\s*/);
        if (rangeMatch) {
            var firstPart = rangeMatch[1];
            var afterDash = fullText.trimStart().substring(rangeMatch[0].length);
            var first = parseLeadingQty(firstPart);
            var second = parseLeadingQty(afterDash);
            if (first && second && second.value > first.value) {
                li.setAttribute('data-orig-qty', first.value);
                li.setAttribute('data-orig-qty2', second.value);
                li.setAttribute('data-orig-text', fullText);
                li.setAttribute('data-is-range', 'true');
                // skip to gram storage below
            }
        }

        if (!li.hasAttribute('data-orig-qty')) {
            var parsed = parseLeadingQty(fullText);
            if (parsed) {
                li.setAttribute('data-orig-qty', parsed.value);
                li.setAttribute('data-orig-text', fullText);
            }
        }

        var gramsSpan = li.querySelector('.ingredient-grams');
        if (gramsSpan) {
            var origGramsText = gramsSpan.textContent;
            var gVal = parseGrams(origGramsText);
            if (gVal !== null) {
                gramsSpan.setAttribute('data-orig-grams', gVal);
                gramsSpan.setAttribute('data-orig-grams-text', origGramsText);
            }
        }
    });

    // Store original weight values
    var weightItems = document.querySelectorAll('.weight-list li');
    weightItems.forEach(function(li) {
        var strong = li.querySelector('strong');
        if (!strong) return;
        var label = strong.textContent.trim().toLowerCase();
        var valueText = li.textContent.replace(strong.textContent, '').trim();
        var m = valueText.match(/~?([\d,]+(?:\.\d+)?)/);
        if (m) {
            li.setAttribute('data-orig-weight', parseFloat(m[1].replace(/,/g, '')));
            li.setAttribute('data-orig-weight-text', valueText);
            li.setAttribute('data-weight-label', label);
        }
    });

    // Compute minimum servings: smallest count where all ingredients snap to fractions
    var minServings = 1;
    for (var s = 1; s < originalServings; s++) {
        var mult = s / originalServings;
        var allFit = true;
        ingredients.forEach(function(li) {
            var origQty = li.getAttribute('data-orig-qty');
            if (origQty === null) return;
            if (!fitsKnownFraction(parseFloat(origQty) * mult)) allFit = false;
            var origQty2 = li.getAttribute('data-orig-qty2');
            if (origQty2 !== null && !fitsKnownFraction(parseFloat(origQty2) * mult)) allFit = false;
        });
        if (allFit) { minServings = s; break; }
    }

    // --- Build stepper UI ---

    var ingredientsH2 = document.querySelector('#ingredients h2');
    if (!ingredientsH2) return;

    var stepper = document.createElement('div');
    stepper.className = 'servings-stepper';
    stepper.setAttribute('role', 'group');
    stepper.setAttribute('aria-label', 'Adjust servings');

    var originalNote = document.createElement('span');
    originalNote.className = 'stepper-original';
    originalNote.textContent = isRange
        ? 'Originally ' + servingsFullText
        : 'Originally ' + originalServings;
    originalNote.style.visibility = 'hidden';

    var minusBtn = document.createElement('button');
    minusBtn.className = 'stepper-btn';
    minusBtn.textContent = '\u2212';
    minusBtn.setAttribute('aria-label', 'Decrease servings');
    if (currentServings <= minServings) minusBtn.disabled = true;

    var valueDisplay = document.createElement('span');
    valueDisplay.className = 'stepper-value';
    valueDisplay.textContent = String(currentServings);
    valueDisplay.setAttribute('aria-live', 'polite');

    var plusBtn = document.createElement('button');
    plusBtn.className = 'stepper-btn';
    plusBtn.textContent = '+';
    plusBtn.setAttribute('aria-label', 'Increase servings');

    stepper.appendChild(originalNote);
    stepper.appendChild(minusBtn);
    stepper.appendChild(valueDisplay);
    stepper.appendChild(plusBtn);

    // Wrap h2 and stepper in a flex row
    var headerRow = document.createElement('div');
    headerRow.className = 'ingredients-header';
    ingredientsH2.parentNode.insertBefore(headerRow, ingredientsH2);
    headerRow.appendChild(ingredientsH2);
    headerRow.appendChild(stepper);

    // Print note (hidden on screen, shown when printing if scaled)
    var printNote = document.createElement('div');
    printNote.className = 'scale-print-note';
    printNote.id = 'scale-print-note';
    headerRow.parentNode.insertBefore(printNote, ingredientList);

    // --- Scaling engine ---

    function applyScale(newServings) {
        if (newServings < minServings) return;
        currentServings = newServings;
        var multiplier = newServings / originalServings;

        // Update stepper display
        valueDisplay.textContent = String(newServings);
        minusBtn.disabled = newServings <= minServings;
        originalNote.style.visibility = newServings === originalServings ? 'hidden' : 'visible';

        // Update servings in overview card (restore original range text when at base)
        var textNode = servingsLi.lastChild;
        if (textNode && textNode.nodeType === 3) {
            textNode.textContent = newServings === originalServings
                ? ' ' + servingsFullText
                : ' ' + newServings;
        }

        // Scale ingredients
        ingredients.forEach(function(li) {
            var origQty = li.getAttribute('data-orig-qty');
            if (origQty === null) return; // unscalable (e.g., "Salt to taste")

            origQty = parseFloat(origQty);
            var origText = li.getAttribute('data-orig-text');
            var newQty = origQty * multiplier;
            var isRange = li.getAttribute('data-is-range') === 'true';

            if (isRange) {
                var origQty2 = parseFloat(li.getAttribute('data-orig-qty2'));
                var newQty2 = origQty2 * multiplier;
                // Rebuild range text: "formatQty(newQty)–formatQty(newQty2) rest"
                var rm = origText.trimStart().match(/^(.+?)\s*([–\-])\s*/);
                if (rm) {
                    var afterFirst = origText.trimStart().substring(rm[0].length);
                    var secondParsed = parseLeadingQty(afterFirst);
                    if (secondParsed) {
                        var restOfText = afterFirst.substring(secondParsed.end);
                        var newText = formatQty(newQty) + rm[2] + formatQty(newQty2) + restOfText;
                        for (var i = 0; i < li.childNodes.length; i++) {
                            if (li.childNodes[i].nodeType === 3) {
                                li.childNodes[i].textContent = newText;
                                break;
                            }
                        }
                    }
                }
            } else {
                // Single quantity — replace the leading quantity portion
                var parsed = parseLeadingQty(origText);
                if (parsed) {
                    var after = origText.substring(parsed.end);
                    var newText = formatQty(newQty) + after;
                    for (var i = 0; i < li.childNodes.length; i++) {
                        if (li.childNodes[i].nodeType === 3) {
                            li.childNodes[i].textContent = newText;
                            break;
                        }
                    }
                }
            }

            // Scale gram weights — handle ranges and complex formats
            var gramsSpan = li.querySelector('.ingredient-grams');
            if (gramsSpan && gramsSpan.hasAttribute('data-orig-grams')) {
                var origGramsText = gramsSpan.getAttribute('data-orig-grams-text');
                // Replace all numbers in the gram text proportionally
                var newGramsText = origGramsText.replace(/(\d[\d,]*(?:\.\d+)?)/g, function(match) {
                    var origNum = parseFloat(match.replace(/,/g, ''));
                    var scaled = origNum * multiplier;
                    return formatGramsVal(scaled);
                });
                gramsSpan.textContent = newGramsText;
            }
        });

        // Scale weight estimates (Uncooked and Cooked scale; Per Serving stays the same)
        weightItems.forEach(function(li) {
            if (!li.hasAttribute('data-orig-weight')) return;
            var wLabel = li.getAttribute('data-weight-label');
            var origWeight = parseFloat(li.getAttribute('data-orig-weight'));
            var origText = li.getAttribute('data-orig-weight-text');

            if (wLabel === 'per serving') return;

            var newWeight = origWeight * multiplier;
            var textNode = li.lastChild;
            if (textNode && textNode.nodeType === 3) {
                var prefix = origText.charAt(0) === '~' ? '~' : '';
                textNode.textContent = ' ' + prefix + formatGramsVal(newWeight) + ' g';
            }
        });

        // Update nutrition note
        var nutritionSource = document.querySelector('.nutrition-source');
        if (nutritionSource) {
            if (!nutritionSource.hasAttribute('data-orig-text')) {
                nutritionSource.setAttribute('data-orig-text', nutritionSource.textContent);
            }
            var origNutritionText = nutritionSource.getAttribute('data-orig-text');
            if (newServings === originalServings) {
                nutritionSource.textContent = origNutritionText;
            } else {
                var scaleNote = ' \u00b7 Batch scaled to ' + newServings + ' servings';
                nutritionSource.textContent = origNutritionText + scaleNote;
            }
        }

        // Update print note
        if (newServings === originalServings) {
            printNote.classList.remove('visible');
            printNote.textContent = '';
        } else {
            var mult = Math.round(multiplier * 100) / 100;
            printNote.textContent = 'Scaled: ' + newServings + ' servings (' + mult + '\u00d7)';
            printNote.classList.add('visible');
        }

        // Recalculate scroll padding
        if (updateScrollPadding) updateScrollPadding();
    }

    // Wire up buttons
    minusBtn.addEventListener('click', function() { applyScale(currentServings - 1); });
    plusBtn.addEventListener('click', function() { applyScale(currentServings + 1); });
})();

// --- Step tracking ---
// Tap a step to mark it as "current." Steps above dim as done.
// Tap the same step again to clear.
(function() {
    var stepsOl = document.querySelector('.steps-card ol');
    if (!stepsOl) return;

    var steps = Array.prototype.slice.call(stepsOl.querySelectorAll(':scope > li'));
    if (steps.length === 0) return;

    var activeIndex = -1;

    function setActive(index) {
        if (index === activeIndex) {
            // Tap same step → clear all
            activeIndex = -1;
        } else {
            activeIndex = index;
        }
        steps.forEach(function(li, i) {
            li.classList.toggle('step-done', activeIndex >= 0 && i < activeIndex);
            li.classList.toggle('step-active', i === activeIndex);
        });
    }

    steps.forEach(function(li, i) {
        li.style.cursor = 'pointer';
        li.addEventListener('click', function() { setActive(i); });
    });
})();

// --- Wake Lock (keep screen on while cooking) ---
// Uses the Screen Wake Lock API to prevent the device from sleeping on recipe pages.
// Progressive enhancement: silently does nothing on unsupported browsers.
(function() {
    if (!('wakeLock' in navigator)) return;

    var sentinel = null;
    var toastShown = false;

    function requestWakeLock() {
        navigator.wakeLock.request('screen').then(function(s) {
            sentinel = s;
            s.addEventListener('release', function() { sentinel = null; });
            if (!toastShown) {
                toastShown = true;
                showToast();
            }
        }).catch(function() {
            // Silently fail — battery saver, low battery, permissions, etc.
        });
    }

    function showToast() {
        var toast = document.createElement('div');
        toast.id = 'wakelock-toast';
        toast.textContent = '\uD83D\uDD12 Screen stays on';

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
            toast.offsetHeight; // force reflow
            s.opacity = '1';
        }

        setTimeout(function() {
            if (!reduceMotion) {
                s.opacity = '0';
                setTimeout(function() { toast.remove(); }, 250);
            } else {
                toast.remove();
            }
        }, 1500);
    }

    requestWakeLock();

    // Re-acquire when returning to the tab (browser releases on visibility change)
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible' && !sentinel) {
            requestWakeLock();
        }
    });
})();
