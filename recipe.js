(function() {
    var updateScrollPadding = null;

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
                        window.scrollTo({ top: top, behavior: 'smooth' });
                    }
                }
            });
        });

        // Active pill highlighting via IntersectionObserver
        if (typeof IntersectionObserver !== 'undefined' && sections.length > 0) {
            var currentActive = null;

            var observer = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (entry.isIntersecting) {
                        if (currentActive) currentActive.classList.remove('active');
                        for (var i = 0; i < sections.length; i++) {
                            if (sections[i].el === entry.target) {
                                sections[i].pill.classList.add('active');
                                currentActive = sections[i].pill;
                                break;
                            }
                        }
                    }
                });
            }, {
                rootMargin: '-' + (navHeight + 20) + 'px 0px -60% 0px',
                threshold: 0
            });

            sections.forEach(function(s) {
                observer.observe(s.el);
            });
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
        var currentOpen = null;

        ingredientList.addEventListener('click', function(e) {
            var li = e.target.closest('li[data-subs]');
            if (!li || !ingredientList.contains(li)) return;

            // Don't toggle if user clicked inside the sub-list itself
            if (e.target.closest('.sub-list')) return;

            var subList = li.querySelector('.sub-list');
            if (!subList) return;

            // Close previously open item
            if (currentOpen && currentOpen !== li) {
                currentOpen.classList.remove('open');
                var prevSub = currentOpen.querySelector('.sub-list');
                if (prevSub) prevSub.hidden = true;
            }

            // Toggle current item
            var isOpen = li.classList.toggle('open');
            subList.hidden = !isOpen;
            currentOpen = isOpen ? li : null;

            if (updateScrollPadding) updateScrollPadding();
        });
    }
})();
