(() => {
    const requiredRole = document.currentScript?.dataset.role;

    fetch('api/me.php', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(async (response) => {
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.authenticated) {
                window.location.replace('login.html');
                return;
            }
            if (requiredRole && data.user.role !== requiredRole) {
                window.location.replace(data.user.role === 'admin' ? 'admin-dashboard.html' : 'client-dashboard.html');
                return;
            }
            window.currentUser = data.user;
            document.documentElement.classList.add('authenticated');
            window.dispatchEvent(new CustomEvent('auth:ready', { detail: data.user }));
        })
        .catch(() => window.location.replace('login.html'));
})();
