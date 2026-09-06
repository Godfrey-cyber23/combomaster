// Wait for the DOM to fully load before running scripts
document.addEventListener('DOMContentLoaded', () => {

    // Initialize Lucide Icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // ===== Dark/Light Mode Toggle =====
    const themeToggle = document.getElementById('theme-toggle');
    const themeToggleMobile = document.getElementById('theme-toggle-mobile');
    const body = document.body;

    // Get icon elements inside toggle buttons
    function getThemeIconElements() {
        const icons = [];
        if (themeToggle) {
            const icon = themeToggle.querySelector('i');
            if (icon) icons.push(icon);
        }
        if (themeToggleMobile) {
            const icon = themeToggleMobile.querySelector('i');
            if (icon) icons.push(icon);
        }
        return icons;
    }

    function updateThemeIcons(isLight) {
        const iconName = isLight ? 'sun' : 'moon';
        const icons = getThemeIconElements();
        icons.forEach(icon => {
            icon.setAttribute('data-lucide', iconName);
        });
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    function applyTheme(isLight) {
        if (isLight) {
            body.classList.add('light-mode');
        } else {
            body.classList.remove('light-mode');
        }
        updateThemeIcons(isLight);
        updateNavbarScroll();
    }

    // Load saved preference or system preference
    const currentTheme = localStorage.getItem('theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const initialIsLight = currentTheme === 'light' || (!currentTheme && prefersLight);
    applyTheme(initialIsLight);

    function toggleTheme(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const isLight = !body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        applyTheme(isLight);
    }

    // Attach click and touch events
    [themeToggle, themeToggleMobile].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', toggleTheme);
            btn.addEventListener('touchend', function(e) {
                e.preventDefault();
                toggleTheme(e);
            });
        }
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            applyTheme(e.matches);
        }
    });

    // ===== Mobile Menu =====
    const mobileToggle = document.getElementById('mobile-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    const menuIcon = document.getElementById('menu-icon');
    let menuOpen = false;

    function toggleMobileMenu(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        menuOpen = !menuOpen;
        
        if (mobileMenu) {
            if (menuOpen) {
                mobileMenu.classList.add('open');
            } else {
                mobileMenu.classList.remove('open');
            }
        }
        
        if (menuIcon) {
            menuIcon.setAttribute('data-lucide', menuOpen ? 'x' : 'menu');
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    if (mobileToggle) {
        mobileToggle.addEventListener('click', toggleMobileMenu);
        mobileToggle.addEventListener('touchend', function(e) {
            e.preventDefault();
            toggleMobileMenu(e);
        });
    }

    // Close mobile menu when clicking outside
    document.addEventListener('click', function(e) {
        if (menuOpen && mobileMenu && mobileToggle) {
            if (!mobileMenu.contains(e.target) && !mobileToggle.contains(e.target)) {
                closeMobileMenu();
            }
        }
    });

    // Close mobile menu on window resize
    window.addEventListener('resize', function() {
        if (window.innerWidth >= 1024 && menuOpen) {
            closeMobileMenu();
        }
    });

    window.closeMobileMenu = function() {
        if (!menuOpen) return;
        menuOpen = false;
        
        if (mobileMenu) {
            mobileMenu.classList.remove('open');
        }
        
        if (menuIcon) {
            menuIcon.setAttribute('data-lucide', 'menu');
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    };

    // ===== Navbar Scroll Effect =====
    const navbar = document.getElementById('navbar');

    function updateNavbarScroll() {
        if (!navbar) return;
        const isLight = body.classList.contains('light-mode');
        
        if (window.scrollY > 50) {
            navbar.style.backgroundColor = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(5, 5, 5, 0.95)';
            navbar.style.backdropFilter = 'blur(12px)';
            navbar.style.webkitBackdropFilter = 'blur(12px)';
            navbar.style.borderBottom = isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.05)';
        } else {
            navbar.style.backgroundColor = 'transparent';
            navbar.style.backdropFilter = 'none';
            navbar.style.webkitBackdropFilter = 'none';
            navbar.style.borderBottom = '1px solid transparent';
        }
    }

    // Optimized scroll listener
    let ticking = false;
    window.addEventListener('scroll', function() {
        if (!ticking) {
            window.requestAnimationFrame(function() {
                updateNavbarScroll();
                ticking = false;
            });
            ticking = true;
        }
    });
    
    updateNavbarScroll();

    // ===== Unified Tab Switching =====
    window.switchTab = function(tabGroup, tab) {
        const contents = document.querySelectorAll(`.${tabGroup}-content`);
        contents.forEach(el => el.classList.add('hidden'));

        const contentEl = document.getElementById(`${tabGroup}-${tab}`);
        if (contentEl) {
            contentEl.classList.remove('hidden');
        }

        const tabs = document.querySelectorAll(`[id^="${tabGroup}-tab-"]`);
        tabs.forEach(btn => btn.classList.remove('active'));

        const activeBtn = document.getElementById(`${tabGroup}-tab-${tab}`);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    };

    window.switchTrainingTab = function(tab) { window.switchTab('services', tab); };
    window.switchShopTab = function(tab) { window.switchTab('shop', tab); };

    // ===== Toast Notification =====
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    let toastTimer;

    window.showToast = function(message) {
        if (!toast || !toastMsg) return;
        
        if (toastTimer) {
            clearTimeout(toastTimer);
        }
        
        toastMsg.textContent = message;
        toast.classList.add('show');
        
        toastTimer = setTimeout(function() {
            toast.classList.remove('show');
        }, 3000);
    };

    // ===== Forms =====
    window.handleContactSubmit = function(e) {
        if (e) e.preventDefault();
        window.showToast('Message sent successfully! We\'ll get back to you soon.');
        if (e && e.target) e.target.reset();
        return false;
    };

    window.handleLoginSubmit = function(e) {
        if (e) e.preventDefault();
        window.showToast('Logging in...');
        return false;
    };

    window.handleNewsletter = function(e) {
        if (e) e.preventDefault();
        window.showToast('Subscribed! Welcome to the ComboMaster community.');
        if (e && e.target) e.target.reset();
        return false;
    };

    // ===== Stat Counter Animation =====
    const statNumbers = document.querySelectorAll('.stat-number');
    if (statNumbers.length > 0) {
        const statObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const target = parseInt(el.getAttribute('data-target'));
                    if (isNaN(target)) return;
                    
                    const suffix = target === 98 ? '%' : '+';
                    let current = 0;
                    const duration = 2000;
                    const increment = target / (duration / 16);
                    
                    function updateCounter() {
                        current += increment;
                        if (current >= target) {
                            el.textContent = target + suffix;
                            return;
                        }
                        el.textContent = Math.floor(current) + suffix;
                        requestAnimationFrame(updateCounter);
                    }
                    
                    updateCounter();
                    statObserver.unobserve(el);
                }
            });
        }, { threshold: 0.5 });

        statNumbers.forEach(function(el) {
            statObserver.observe(el);
        });
    }

    // ===== Smooth Scroll for anchor links =====
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href && href !== '#') {
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start' 
                    });
                }
            }
        });
    });

    // ===== Scroll Reveal Animation =====
    const revealElements = document.querySelectorAll('.reveal-on-scroll');
    if (revealElements.length > 0) {
        const revealObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { 
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        revealElements.forEach(function(el) {
            revealObserver.observe(el);
        });
    }

    // ===== Keyboard Accessibility =====
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && menuOpen) {
            closeMobileMenu();
        }
    });

});