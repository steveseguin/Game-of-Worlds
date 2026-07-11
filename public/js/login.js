/**
 * login.js - Client-side authentication manager
 * 
 * Handles user login and registration forms, validation,
 * and communication with the server for authentication.
 * Manages the authentication flow before entering the game.
 * 
 * This module is client-side only and does not directly access the database.
 * It communicates with the server via HTTP requests for authentication.
 * 
 * Dependencies:
 * - None, but used by the login.html page
 */
const LoginSystem = (function() {
    function initialize() {
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', handleLogin);
        }
        
        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('submit', handleRegister);
        }

        const guestLoginBtn = document.getElementById('guestLoginBtn');
        if (guestLoginBtn) {
            guestLoginBtn.addEventListener('click', handleGuestLogin);
        }
        
        const registerLink = document.getElementById('registerLink');
        if (registerLink) {
            registerLink.addEventListener('click', showRegisterForm);
        }
        
        const loginLink = document.getElementById('loginLink');
        if (loginLink) {
            loginLink.addEventListener('click', showLoginForm);
        }

        const loginTab = document.getElementById('loginTab');
        if (loginTab) {
            loginTab.addEventListener('click', event => {
                event.preventDefault();
                switchPanels('login');
            });
        }

        const registerTab = document.getElementById('registerTab');
        if (registerTab) {
            registerTab.addEventListener('click', event => {
                event.preventDefault();
                switchPanels('register');
            });
        }

        const params = new URLSearchParams(window.location.search);
        if (params.get('upgrade') === '1' || localStorage.getItem('gowIsGuest') === '1') {
            prepareGuestUpgradeNotice();
            if (params.get('upgrade') === '1') {
                switchPanels('register');
            }
        }
    }
    
    function showRegisterForm(e) {
        e.preventDefault();
        switchPanels('register');
    }
    
    function showLoginForm(e) {
        e.preventDefault();
        switchPanels('login');
    }

    function switchPanels(panel) {
        const loginPanel = document.getElementById('loginPanel');
        const registerPanel = document.getElementById('registerPanel');
        const loginTab = document.getElementById('loginTab');
        const registerTab = document.getElementById('registerTab');

        if (!loginPanel || !registerPanel || !loginTab || !registerTab) {
            return;
        }

        const showLogin = panel === 'login';

        loginPanel.classList.toggle('is-active', showLogin);
        registerPanel.classList.toggle('is-active', !showLogin);

        if (showLogin) {
            loginPanel.removeAttribute('hidden');
            registerPanel.setAttribute('hidden', '');
        } else {
            registerPanel.removeAttribute('hidden');
            loginPanel.setAttribute('hidden', '');
        }

        loginTab.classList.toggle('is-active', showLogin);
        registerTab.classList.toggle('is-active', !showLogin);

        loginTab.setAttribute('aria-selected', showLogin ? 'true' : 'false');
        registerTab.setAttribute('aria-selected', showLogin ? 'false' : 'true');

        if (showLogin) {
            const registerError = document.getElementById('registerError');
            const registerSuccess = document.getElementById('registerSuccess');
            if (registerError) {
                registerError.textContent = '';
            }
            if (registerSuccess) {
                registerSuccess.textContent = '';
            }
        } else {
            const loginError = document.getElementById('loginError');
            if (loginError) {
                loginError.textContent = '';
            }
        }
    }

    function persistAuth(data) {
        const isGuest = data.isGuest === true || data.isGuest === 1 || data.isGuest === '1';
        const maxAge = isGuest ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
        const cookieAttributes = `path=/; max-age=${maxAge}; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;

        document.cookie = `userId=${encodeURIComponent(data.userId)}; ${cookieAttributes}`;
        document.cookie = `tempKey=${encodeURIComponent(data.tempKey)}; ${cookieAttributes}`;

        localStorage.setItem('userId', data.userId);
        localStorage.setItem('username', data.username || '');
        localStorage.setItem('gowIsGuest', isGuest ? '1' : '0');

        if (isGuest && data.guestToken) {
            localStorage.setItem('gowGuestToken', data.guestToken);
        }
        if (!isGuest) {
            localStorage.removeItem('gowGuestToken');
        }
    }

    function prepareGuestUpgradeNotice() {
        const notice = document.getElementById('upgradeNotice');
        if (notice && localStorage.getItem('gowIsGuest') === '1') {
            notice.hidden = false;
        }
        const usernameField = document.getElementById('registerUsername');
        const currentName = localStorage.getItem('username');
        if (usernameField && currentName && !usernameField.value) {
            usernameField.value = currentName;
        }
    }
    
    function handleLogin(e) {
        e.preventDefault();
        const submitButton = e.currentTarget?.querySelector('button[type="submit"]');
        const errorEl = document.getElementById('loginError');
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        if (errorEl) errorEl.textContent = '';
        if (submitButton) submitButton.disabled = true;
        
        // Send login request to server
        fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        })
        .then(response => response.json())
            .then(data => {
            if (data.success) {
                persistAuth(data);
                
                // Redirect to game
                window.location.href = '/lobby.html';
            } else {
                document.getElementById('loginError').textContent = data.error || 'Login failed';
            }
        })
        .catch(error => {
            console.error('Login error:', error);
            if (errorEl) errorEl.textContent = 'Unable to reach the server. Check your connection and try again.';
        })
        .finally(() => {
            if (submitButton) submitButton.disabled = false;
        });
    }

    function handleGuestLogin() {
        const usernameField = document.getElementById('guestUsername');
        const errorEl = document.getElementById('guestError');
        const button = document.getElementById('guestLoginBtn');
        const username = usernameField ? usernameField.value.trim() : '';
        const guestToken = localStorage.getItem('gowGuestToken') || '';

        if (errorEl) {
            errorEl.textContent = '';
        }
        if (button) {
            button.disabled = true;
            button.textContent = 'Connecting...';
        }

        fetch('/guest-login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, guestToken })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                persistAuth(data);
                window.location.href = '/lobby.html';
                return;
            }
            if (errorEl) {
                errorEl.textContent = data.error || 'Guest access failed';
            }
        })
        .catch(error => {
            console.error('Guest login error:', error);
            if (errorEl) {
                errorEl.textContent = 'Guest access failed';
            }
        })
        .finally(() => {
            if (button) {
                button.disabled = false;
                button.textContent = 'Continue as Guest';
            }
        });
    }
    
    function handleRegister(e) {
        e.preventDefault();
        const submitButton = e.currentTarget?.querySelector('button[type="submit"]');
        const username = document.getElementById('registerUsername').value;
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;
        const confirm = document.getElementById('confirmPassword').value;
        const errorEl = document.getElementById('registerError');
        const successEl = document.getElementById('registerSuccess');

        errorEl.textContent = '';
        successEl.textContent = '';

        if (!email) {
            errorEl.textContent = 'Email is required';
            return;
        }
        
        if (password !== confirm) {
            errorEl.textContent = 'Passwords do not match';
            return;
        }

        if (!isStrongEnoughPassword(password)) {
            errorEl.textContent = 'Password must be 8-128 characters and include at least one letter and one number';
            return;
        }
        if (submitButton) submitButton.disabled = true;
        
        // Send registration request to server
        fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username,
                password,
                email,
                guestToken: localStorage.getItem('gowGuestToken') || ''
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                persistAuth(data);
                
                // Show success and redirect
                successEl.textContent = data.upgraded ? 'Guest progress linked!' : 'Registration successful!';
                setTimeout(() => {
                    window.location.href = '/lobby.html';
                }, 1000);
            } else {
                errorEl.textContent = data.error || 'Registration failed';
            }
        })
        .catch(error => {
            console.error('Registration error:', error);
            errorEl.textContent = 'Unable to reach the server. Check your connection and try again.';
        })
        .finally(() => {
            if (submitButton) submitButton.disabled = false;
        });
    }

    function isStrongEnoughPassword(password) {
        return typeof password === 'string' &&
            password.length >= 8 &&
            password.length <= 128 &&
            /[A-Za-z]/.test(password) &&
            /\d/.test(password);
    }
    
    return {
        initialize
    };
})();

document.addEventListener('DOMContentLoaded', LoginSystem.initialize);
