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
        
        const registerLink = document.getElementById('registerLink');
        if (registerLink) {
            registerLink.addEventListener('click', showRegisterForm);
        }
        
        const loginLink = document.getElementById('loginLink');
        if (loginLink) {
            loginLink.addEventListener('click', showLoginForm);
        }
    }
    
    function showRegisterForm(e) {
        e.preventDefault();
        document.getElementById('loginPanel').style.display = 'none';
        document.getElementById('registerPanel').style.display = 'block';
    }
    
    function showLoginForm(e) {
        e.preventDefault();
        document.getElementById('registerPanel').style.display = 'none';
        document.getElementById('loginPanel').style.display = 'block';
    }
    
    function handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        
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
                // Store auth tokens in cookies
                document.cookie = `userId=${data.userId}; path=/; max-age=86400`;
                document.cookie = `tempKey=${data.tempKey}; path=/; max-age=86400`;
                
                // Store user ID in localStorage for shop access
                localStorage.setItem('userId', data.userId);
                localStorage.setItem('username', data.username);
                
                // Redirect to game
                window.location.href = '/lobby.html';
            } else {
                document.getElementById('loginError').textContent = data.error || 'Login failed';
            }
        })
        .catch(error => {
            console.error('Login error:', error);
        });
    }
    
    function handleRegister(e) {
        e.preventDefault();
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
        
        // Send registration request to server
        fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password, email })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Store auth tokens in cookies
                document.cookie = `userId=${data.userId}; path=/; max-age=86400`;
                document.cookie = `tempKey=${data.tempKey}; path=/; max-age=86400`;
                
                // Show success and redirect
                successEl.textContent = 'Registration successful!';
                setTimeout(() => {
                    window.location.href = '/lobby.html';
                }, 1000);
            } else {
                errorEl.textContent = data.error || 'Registration failed';
            }
        })
        .catch(error => {
            console.error('Registration error:', error);
        });
    }
    
    return {
        initialize
    };
})();

document.addEventListener('DOMContentLoaded', LoginSystem.initialize);
