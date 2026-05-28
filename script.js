// Initialize Lucide Icons
lucide.createIcons();

// ===== Dark/Light Mode Toggle =====
const themeToggle = document.getElementById('theme-toggle');
const themeToggleMobile = document.getElementById('theme-toggle-mobile');
const body = document.body;

// Apply saved theme or system preference on load
function applyTheme(isLight) {
    if (isLight) {
        body.classList.add('light-mode');
    } else {
        body.classList.remove('light-mode');
    }
    updateThemeIcons(isLight);
    updateNavbarScroll(); // Ensure navbar colors update instantly
}

function updateThemeIcons(isLight) {
    const iconName = isLight ? 'sun' : 'moon';
    if (themeToggle) themeToggle.setAttribute('data-lucide', iconName);
    if (themeToggleMobile) themeToggleMobile.setAttribute('data-lucide', iconName);
    lucide.createIcons();
}

// Check for saved preference, otherwise check system preference
const currentTheme = localStorage.getItem('theme');
const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
const initialIsLight = currentTheme === 'light' || (!currentTheme && prefersLight);
applyTheme(initialIsLight);

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const isLight = !body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        applyTheme(isLight);
    });
}
if (themeToggleMobile) {
    themeToggleMobile.addEventListener('click', () => {
        const isLight = !body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        applyTheme(isLight);
    });
}

// ===== Mobile Menu =====
const mobileToggle = document.getElementById('mobile-toggle');
const mobileMenu = document.getElementById('mobile-menu');
let menuOpen = false;

if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', () => {
        menuOpen = !menuOpen;
        mobileMenu.classList.toggle('open', menuOpen);
        const icon = document.getElementById('menu-icon');
        if (icon) {
            icon.setAttribute('data-lucide', menuOpen ? 'x' : 'menu');
            lucide.createIcons();
        }
    });
}

function closeMobileMenu() {
    if (!mobileMenu) return;
    menuOpen = false;
    mobileMenu.classList.remove('open');
    const icon = document.getElementById('menu-icon');
    if (icon) {
        icon.setAttribute('data-lucide', 'menu');
        lucide.createIcons();
    }
}

// ===== Navbar Scroll Effect =====
const navbar = document.getElementById('navbar');

function updateNavbarScroll() {
    if (!navbar) return;
    const isLight = body.classList.contains('light-mode');
    
    if (window.scrollY > 50) {
        navbar.style.backgroundColor = isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(5, 5, 5, 0.9)';
        navbar.style.backdropFilter = 'blur(12px)';
        navbar.style.borderBottom = isLight ? '1px solid rgba(0,0,0,0.05)' : '1px solid rgba(255,255,255,0.05)';
    } else {
        navbar.style.backgroundColor = 'transparent';
        navbar.style.backdropFilter = 'none';
        navbar.style.borderBottom = '1px solid transparent';
    }
}

window.addEventListener('scroll', updateNavbarScroll);
updateNavbarScroll(); // Run on load

// ===== Unified Tab Switching =====
// Works for any section (training, shop, etc.) by passing the group name
function switchTab(tabGroup, tab) {
    const contentEl = document.getElementById(`${tabGroup}-${tab}`);
    if (!contentEl) return; // Exit if element doesn't exist on this page

    document.querySelectorAll(`.${tabGroup}-content`).forEach(el => el.classList.add('hidden'));
    contentEl.classList.remove('hidden');

    document.querySelectorAll(`[id^="${tabGroup}-tab-"]`).forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`${tabGroup}-tab-${tab}`);
    if (activeBtn) activeBtn.classList.add('active');
}

// Backwards compatibility aliases for HTML onclick attributes
function switchTrainingTab(tab) { switchTab('training', tab); }
function switchShopTab(tab) { switchTab('shop', tab); }

// ===== Toast Notification =====
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    if (!toast || !toastMsg) return;
    
    toastMsg.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== Forms =====
function handleContactSubmit(e) {
    e.preventDefault();
    showToast('Message sent successfully! We\'ll get back to you soon.');
    e.target.reset();
}

function handleLoginSubmit(e) {
    e.preventDefault();
    showToast('Logging in...');
    // Add actual authentication logic here
}

function handleNewsletter(e) {
    e.preventDefault();
    showToast('Subscribed! Welcome to the ComboMaster community.');
    e.target.reset();
}

// ===== Stat Counter Animation =====
const statNumbers = document.querySelectorAll('.stat-number');
if (statNumbers.length > 0) {
    const observerOptions = { threshold: 0.5 };

    const statObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.getAttribute('data-target'));
                let current = 0;
                const increment = target / 60;
                const timer = setInterval(() => {
                    current += increment;
                    if (current >= target) {
                        current = target;
                        clearInterval(timer);
                    }
                    el.textContent = Math.floor(current) + (target === 98 ? '%' : '+');
                }, 30);
                statObserver.unobserve(el); // Stop observing once animated
            }
        });
    }, observerOptions);

    statNumbers.forEach(el => statObserver.observe(el));
}

// ===== Smooth Scroll for anchor links =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href !== '#') {
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });
});

// ===== Scroll Reveal Animation =====
const revealElements = document.querySelectorAll('.reveal-on-scroll');
if (revealElements.length > 0) {
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                revealObserver.unobserve(entry.target); // Only animate once
            }
        });
    }, { threshold: 0.1 });

    revealElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        revealObserver.observe(el);
    });
}