(function() {
    var input = document.getElementById('search-input');
    var clearBtn = document.getElementById('search-clear');
    var defaultContent = document.getElementById('default-content');
    var searchResults = document.getElementById('search-results');
    var noResults = document.getElementById('no-results');
    var fuse = null;

    // Bail out if elements aren't present (e.g., index.html not updated yet)
    if (!input || !defaultContent) return;

    fetch('recipes.json')
        .then(function(r) { return r.json(); })
        .then(function(recipes) {
            fuse = new Fuse(recipes, {
                keys: [
                    { name: 'title', weight: 0.5 },
                    { name: 'description', weight: 0.25 },
                    { name: 'ingredients', weight: 0.1 },
                    { name: 'category', weight: 0.08 },
                    { name: 'method', weight: 0.04 },
                    { name: 'time', weight: 0.03 }
                ],
                threshold: 0.2,
                ignoreLocation: true
            });
        })
        .catch(function() {
            input.placeholder = 'Search coming soon...';
            input.disabled = true;
        });

    function buildCard(recipe) {
        var a = document.createElement('a');
        a.href = recipe.url;
        a.className = 'recipe-card';

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

        var servingsText = recipe.servings ? recipe.servings + ' servings' : '';
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
    });

    clearBtn.addEventListener('click', function() {
        input.value = '';
        input.dispatchEvent(new Event('input'));
        input.focus();
    });
})();
