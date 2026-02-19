(function() {
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
    }
})();
