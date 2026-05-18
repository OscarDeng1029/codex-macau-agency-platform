// auth.js - shared Google login and account menu logic.
(function () {
    const SUPABASE_URL = 'https://dvhwdirwpraorehlzdar.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2aHdkaXJ3cHJhb3JlaGx6ZGFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMDcxMjIsImV4cCI6MjA5MjU4MzEyMn0.qJayIOG-eGrPUfOztLa5Kx6E-zS6Ukm23hUor495kjE';
    const STORAGE_KEY = 'macau_housekeeping_my_review_ids';

    let client = null;
    let currentSession = null;
    let migrationPromise = null;
    let migratedUserId = null;
    let migrationAttemptedUserId = null;
    let lastMigration = { status: 'idle', localCount: 0, localIds: [], migrated: 0, alreadyOwned: 0, blocked: 0, missing: 0, error: null };

    function getClient() {
        if (client) return client;
        if (typeof supabaseClient !== 'undefined') {
            client = supabaseClient;
        } else if (window.supabase) {
            client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        return client;
    }

    function getUserName(user) {
        return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Google 用戶';
    }

    function getUserAvatar(user) {
        return user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '';
    }

    function escapeHTML(value = '') {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function escapeAttr(value = '') {
        return escapeHTML(value).replaceAll('`', '&#096;');
    }

    function getLocalReviewIds() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(value) ? value.filter(Boolean) : [];
        } catch (err) {
            console.warn('Unable to parse local review ids:', err);
            return [];
        }
    }

    function setLocalReviewIds(ids) {
        if (!ids.length) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    }

    async function login() {
        const authClient = getClient();
        if (!authClient) {
            alert('登入系統暫時未能載入，請稍後再試。');
            return;
        }

        const { error } = await authClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.href
            }
        });

        if (error) {
            console.error('Google login failed:', error);
            alert('登入失敗：' + error.message);
        }
    }

    async function logout() {
        const authClient = getClient();
        if (!authClient) return;

        const { error } = await authClient.auth.signOut();
        if (error) {
            console.error('Logout failed:', error);
            alert('退出登入失敗，請稍後再試。');
            return;
        }
        window.location.reload();
    }

    async function migrateLocalReviews(session = currentSession) {
        const user = session?.user;
        const localIds = getLocalReviewIds();

        if (!user || localIds.length === 0) {
            lastMigration = { status: 'idle', localCount: localIds.length, localIds, migrated: 0, alreadyOwned: 0, blocked: 0, missing: 0, error: null };
            return lastMigration;
        }

        if (migrationPromise) return migrationPromise;
        if (migratedUserId === user.id) return lastMigration;
        if (migrationAttemptedUserId === user.id && lastMigration.status === 'error') return lastMigration;

        migrationAttemptedUserId = user.id;
        migrationPromise = claimLocalReviews(session, localIds)
            .then(result => {
                if (result.status === 'success') migratedUserId = user.id;
                lastMigration = result;
                return result;
            })
            .finally(() => {
                migrationPromise = null;
            });

        return migrationPromise;
    }

    async function claimLocalReviews(session, localIds) {
        const token = session?.access_token;
        if (!token) {
            return {
                status: 'error',
                localCount: localIds.length,
                localIds,
                migrated: 0,
                alreadyOwned: 0,
                blocked: 0,
                missing: 0,
                error: { message: 'missing_session_token' }
            };
        }

        try {
            const response = await fetch('/api/claim-reviews', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ reviewIds: localIds })
            });
            const payload = await response.json().catch(() => ({}));

            if (!response.ok) {
                const message = payload.message || payload.error || `HTTP ${response.status}`;
                throw new Error(message);
            }

            const claimed = Array.isArray(payload.claimed) ? payload.claimed : [];
            const alreadyOwned = Array.isArray(payload.alreadyOwned) ? payload.alreadyOwned : [];
            const blocked = Array.isArray(payload.blocked) ? payload.blocked : [];
            const missing = Array.isArray(payload.missing) ? payload.missing : [];
            const resolvedIds = new Set([...claimed, ...alreadyOwned, ...blocked, ...missing].map(String));
            const remainingIds = localIds.filter(id => !resolvedIds.has(String(id)));

            setLocalReviewIds(remainingIds);

            return {
                status: 'success',
                localCount: localIds.length,
                localIds,
                migrated: claimed.length,
                alreadyOwned: alreadyOwned.length,
                blocked: blocked.length,
                missing: missing.length,
                error: null
            };
        } catch (error) {
            console.warn('Review ownership migration could not complete:', error);
            return {
                status: 'error',
                localCount: localIds.length,
                localIds,
                migrated: 0,
                alreadyOwned: 0,
                blocked: 0,
                missing: 0,
                error: { message: error.message || 'migration_failed' }
            };
        }
    }

    async function getSession() {
        const authClient = getClient();
        if (!authClient) return null;

        const { data, error } = await authClient.auth.getSession();
        if (error) {
            console.error('Get session failed:', error);
            return null;
        }

        currentSession = data?.session || null;
        return currentSession;
    }

    async function getMyReviews() {
        const authClient = getClient();
        const session = currentSession || await getSession();
        if (!authClient || !session?.user) return [];

        const { data, error } = await authClient
            .from('reviews')
            .select('id, agency_id, agency_name, rating, status, content, created_at')
            .eq('user_id', session.user.id)
            .neq('status', 'deleted')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return Array.isArray(data) ? data : [];
    }

    function injectMenuStyles() {
        if (document.getElementById('macau-auth-menu-style')) return;
        const style = document.createElement('style');
        style.id = 'macau-auth-menu-style';
        style.textContent = `
            .macau-auth-menu-wrap { position: relative; display: inline-flex; }
            .macau-auth-menu {
                position: absolute;
                right: 0;
                top: calc(100% + 10px);
                width: min(280px, calc(100vw - 24px));
                background: rgba(255,255,255,.98);
                border: 1px solid rgba(226,232,240,.95);
                border-radius: 18px;
                box-shadow: 0 22px 60px rgba(15,23,42,.18);
                padding: 8px;
                z-index: 80;
            }
            .macau-auth-menu[hidden] { display: none; }
            .macau-auth-menu::before {
                content: '';
                position: absolute;
                right: 14px;
                top: -6px;
                width: 12px;
                height: 12px;
                transform: rotate(45deg);
                background: white;
                border-left: 1px solid rgba(226,232,240,.95);
                border-top: 1px solid rgba(226,232,240,.95);
            }
            .macau-auth-menu-user { display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 1px solid #f1f5f9; margin-bottom: 4px; }
            .macau-auth-menu-avatar { width: 36px; height: 36px; border-radius: 999px; object-fit: cover; background: #e0e7ff; flex: 0 0 auto; }
            .macau-auth-menu-name { font-size: 13px; font-weight: 900; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .macau-auth-menu-email { font-size: 11px; font-weight: 700; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .macau-auth-menu-item {
                width: 100%;
                display: flex;
                align-items: center;
                gap: 10px;
                border: 0;
                background: transparent;
                color: #334155;
                text-decoration: none;
                border-radius: 12px;
                padding: 10px;
                font-size: 13px;
                font-weight: 900;
                text-align: left;
                cursor: pointer;
            }
            .macau-auth-menu-item:hover { background: #f8fafc; color: #003399; }
            .macau-auth-menu-item .material-symbols-rounded { font-size: 18px; }
            .macau-auth-avatar-img { width: 100%; height: 100%; border-radius: 999px; object-fit: cover; }
        `;
        document.head.appendChild(style);
    }

    function buildAccountMenu(session) {
        const user = session?.user;
        const name = escapeHTML(user ? getUserName(user) : '訪客');
        const email = escapeHTML(user?.email || '尚未連接 Google');
        const avatar = user ? escapeAttr(getUserAvatar(user)) : '';

        return `
            <div class="macau-auth-menu-user">
                ${avatar
                    ? `<img class="macau-auth-menu-avatar" src="${avatar}" alt="">`
                    : `<span class="macau-auth-menu-avatar flex items-center justify-center"><span class="material-symbols-rounded text-[#003399] text-[20px]">person</span></span>`}
                <div class="min-w-0">
                    <div class="macau-auth-menu-name">${name}</div>
                    <div class="macau-auth-menu-email">${email}</div>
                </div>
            </div>
            ${user
                ? `<a class="macau-auth-menu-item" href="profile.html"><span class="material-symbols-rounded">account_circle</span>個人頁</a>
                   <button class="macau-auth-menu-item" type="button" data-auth-action="logout"><span class="material-symbols-rounded">logout</span>退出登入</button>`
                : `<button class="macau-auth-menu-item" type="button" data-auth-action="login"><span class="material-symbols-rounded">login</span>使用 Google 登入</button>
                   <a class="macau-auth-menu-item" href="profile.html"><span class="material-symbols-rounded">account_circle</span>個人頁</a>`}
        `;
    }

    function setupAccountMenus() {
        injectMenuStyles();
        const profileLinks = Array.from(document.querySelectorAll('header a[href="profile.html"][aria-label="用戶中心"]'));

        profileLinks.forEach((link, index) => {
            if (link.dataset.authMenuReady === 'true') return;

            const wrap = document.createElement('div');
            wrap.className = 'macau-auth-menu-wrap';

            const button = document.createElement('button');
            button.type = 'button';
            button.className = link.className;
            button.setAttribute('aria-label', '帳戶選單');
            button.setAttribute('aria-haspopup', 'menu');
            button.setAttribute('aria-expanded', 'false');
            button.dataset.authMenuButton = 'true';

            const menu = document.createElement('div');
            menu.className = 'macau-auth-menu';
            menu.id = `macau-auth-menu-${index}`;
            menu.setAttribute('role', 'menu');
            menu.hidden = true;

            wrap.append(button, menu);
            link.replaceWith(wrap);

            button.addEventListener('click', event => {
                event.stopPropagation();
                const willOpen = menu.hidden;
                closeAllMenus();
                menu.hidden = !willOpen;
                button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            });

            menu.addEventListener('click', event => {
                const action = event.target.closest('[data-auth-action]')?.dataset.authAction;
                if (action === 'login') login();
                if (action === 'logout') logout();
            });
        });

        document.addEventListener('click', closeAllMenus);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeAllMenus();
        });
    }

    function closeAllMenus() {
        document.querySelectorAll('.macau-auth-menu').forEach(menu => { menu.hidden = true; });
        document.querySelectorAll('[data-auth-menu-button]').forEach(button => {
            button.setAttribute('aria-expanded', 'false');
        });
    }

    function renderAccountMenus() {
        document.querySelectorAll('.macau-auth-menu').forEach(menu => {
            menu.innerHTML = buildAccountMenu(currentSession);
        });

        document.querySelectorAll('[data-auth-menu-button]').forEach(button => {
            const avatar = currentSession?.user ? getUserAvatar(currentSession.user) : '';
            button.innerHTML = avatar
                ? `<img class="macau-auth-avatar-img" src="${escapeAttr(avatar)}" alt="">`
                : '<span class="material-symbols-rounded text-[#003399] text-[19px]">person</span>';
        });
    }

    function notifyAuthChange(migration = { migrated: 0, error: null }) {
        window.dispatchEvent(new CustomEvent('macau-auth-change', {
            detail: {
                session: currentSession,
                user: currentSession?.user || null,
                migration,
                localReviewIds: getLocalReviewIds()
            }
        }));
    }

    async function init() {
        setupAccountMenus();
        currentSession = await getSession();
        const migration = currentSession ? await migrateLocalReviews(currentSession) : { migrated: 0, error: null };
        renderAccountMenus();
        notifyAuthChange(migration);

        const authClient = getClient();
        authClient?.auth?.onAuthStateChange(async (_event, session) => {
            currentSession = session || null;
            const nextMigration = currentSession ? await migrateLocalReviews(currentSession) : { migrated: 0, error: null };
            renderAccountMenus();
            notifyAuthChange(nextMigration);
        });

        return currentSession;
    }

    const ready = document.readyState === 'loading'
        ? new Promise(resolve => document.addEventListener('DOMContentLoaded', () => resolve(init()), { once: true }))
        : init();

    window.MacauAuth = {
        ready,
        getClient,
        getSession,
        getCurrentSession: () => currentSession,
        getMyReviews,
        getLocalReviewIds,
        getLastMigration: () => lastMigration,
        inspectLocalReviews: () => ({
            storageKey: STORAGE_KEY,
            localIds: getLocalReviewIds(),
            lastMigration
        }),
        login,
        logout,
        migrateLocalReviews
    };

    window.handleGoogleLogin = login;
    window.handleLogout = logout;
})();
