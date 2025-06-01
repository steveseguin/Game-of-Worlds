/**
 * notification-system.js - In-game notification system
 * 
 * Provides toast notifications, modals, and progress indicators
 * for better user feedback during payment and game events
 */

const NotificationSystem = (function() {
    let container = null;
    let activeNotifications = [];
    let notificationId = 0;
    
    // Initialize notification system
    function initialize() {
        // Create notification container
        container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        document.body.appendChild(container);
        
        // Add styles
        addStyles();
    }
    
    // Add notification styles
    function addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .notification-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10001;
                display: flex;
                flex-direction: column;
                gap: 10px;
                pointer-events: none;
            }
            
            .notification {
                background: rgba(26, 26, 46, 0.95);
                border: 2px solid #16213e;
                border-radius: 8px;
                padding: 15px 20px;
                color: white;
                min-width: 300px;
                max-width: 400px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                display: flex;
                align-items: center;
                gap: 15px;
                animation: slideIn 0.3s ease-out;
                pointer-events: all;
            }
            
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
            
            .notification.removing {
                animation: slideOut 0.3s ease-in;
            }
            
            .notification-icon {
                width: 24px;
                height: 24px;
                flex-shrink: 0;
            }
            
            .notification.success {
                border-color: #2ecc71;
            }
            
            .notification.error {
                border-color: #e74c3c;
            }
            
            .notification.warning {
                border-color: #f39c12;
            }
            
            .notification.info {
                border-color: #3498db;
            }
            
            .notification-content {
                flex: 1;
            }
            
            .notification-title {
                font-weight: bold;
                margin-bottom: 5px;
            }
            
            .notification-message {
                font-size: 14px;
                opacity: 0.9;
            }
            
            .notification-close {
                background: none;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
                opacity: 0.7;
                transition: opacity 0.2s;
            }
            
            .notification-close:hover {
                opacity: 1;
            }
            
            .notification-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 0 0 6px 6px;
                overflow: hidden;
            }
            
            .notification-progress-bar {
                height: 100%;
                background: #3498db;
                transition: width 0.3s linear;
            }
            
            /* Loading indicator */
            .loading-indicator {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(26, 26, 46, 0.95);
                border: 2px solid #16213e;
                border-radius: 10px;
                padding: 30px;
                z-index: 10002;
                text-align: center;
                color: white;
            }
            
            .loading-spinner {
                width: 50px;
                height: 50px;
                border: 3px solid rgba(255, 255, 255, 0.1);
                border-top-color: #3498db;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 20px;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            .loading-text {
                font-size: 16px;
                margin-bottom: 10px;
            }
            
            .loading-subtext {
                font-size: 14px;
                opacity: 0.7;
            }
            
            /* Confirmation modal */
            .confirm-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10003;
            }
            
            .confirm-modal {
                background: #1a1a2e;
                border: 2px solid #16213e;
                border-radius: 10px;
                padding: 30px;
                max-width: 500px;
                width: 90%;
                color: white;
            }
            
            .confirm-modal h3 {
                margin: 0 0 20px;
                color: #3498db;
            }
            
            .confirm-modal-content {
                margin-bottom: 30px;
                line-height: 1.6;
            }
            
            .confirm-modal-buttons {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            }
            
            .confirm-modal button {
                padding: 10px 20px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
                transition: all 0.3s;
            }
            
            .confirm-modal .btn-confirm {
                background: #3498db;
                color: white;
            }
            
            .confirm-modal .btn-cancel {
                background: #7f8c8d;
                color: white;
            }
            
            .confirm-modal button:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
            }
        `;
        document.head.appendChild(style);
    }
    
    // Show notification
    function show(message, type = 'info', duration = 5000, title = '') {
        const id = ++notificationId;
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.dataset.id = id;
        
        // Icon based on type
        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };
        
        notification.innerHTML = `
            <div class="notification-icon">${icons[type]}</div>
            <div class="notification-content">
                ${title ? `<div class="notification-title">${title}</div>` : ''}
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close" onclick="NotificationSystem.remove(${id})">×</button>
            ${duration > 0 ? '<div class="notification-progress"><div class="notification-progress-bar"></div></div>' : ''}
        `;
        
        container.appendChild(notification);
        activeNotifications.push({ id, element: notification });
        
        // Auto-remove after duration
        if (duration > 0) {
            // Animate progress bar
            const progressBar = notification.querySelector('.notification-progress-bar');
            if (progressBar) {
                setTimeout(() => {
                    progressBar.style.width = '0%';
                    progressBar.style.transition = `width ${duration}ms linear`;
                }, 10);
            }
            
            setTimeout(() => remove(id), duration);
        }
        
        return id;
    }
    
    // Remove notification
    function remove(id) {
        const index = activeNotifications.findIndex(n => n.id === id);
        if (index === -1) return;
        
        const notification = activeNotifications[index];
        notification.element.classList.add('removing');
        
        setTimeout(() => {
            notification.element.remove();
            activeNotifications.splice(index, 1);
        }, 300);
    }
    
    // Show loading indicator
    function showLoading(text = 'Processing...', subtext = '') {
        hideLoading(); // Remove any existing
        
        const loader = document.createElement('div');
        loader.id = 'loading-indicator';
        loader.className = 'loading-indicator';
        loader.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-text">${text}</div>
            ${subtext ? `<div class="loading-subtext">${subtext}</div>` : ''}
        `;
        
        document.body.appendChild(loader);
    }
    
    // Hide loading indicator
    function hideLoading() {
        const loader = document.getElementById('loading-indicator');
        if (loader) {
            loader.remove();
        }
    }
    
    // Show confirmation modal
    function confirm(title, message, onConfirm, onCancel = null) {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-modal-overlay';
        
        const modal = document.createElement('div');
        modal.className = 'confirm-modal';
        modal.innerHTML = `
            <h3>${title}</h3>
            <div class="confirm-modal-content">${message}</div>
            <div class="confirm-modal-buttons">
                <button class="btn-cancel">Cancel</button>
                <button class="btn-confirm">Confirm</button>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Handle buttons
        modal.querySelector('.btn-confirm').onclick = () => {
            overlay.remove();
            if (onConfirm) onConfirm();
        };
        
        modal.querySelector('.btn-cancel').onclick = () => {
            overlay.remove();
            if (onCancel) onCancel();
        };
        
        // Close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                overlay.remove();
                if (onCancel) onCancel();
            }
        };
    }
    
    // Payment-specific notifications
    const payment = {
        processing: () => {
            showLoading('Processing Payment...', 'Please do not close this window');
            return show('Processing your payment...', 'info', 0);
        },
        
        success: (item) => {
            hideLoading();
            return show(`Successfully purchased ${item}!`, 'success', 5000, 'Payment Complete');
        },
        
        error: (error) => {
            hideLoading();
            return show(error || 'Payment failed. Please try again.', 'error', 8000, 'Payment Error');
        },
        
        declined: () => {
            hideLoading();
            return show('Your card was declined. Please check your details and try again.', 'error', 8000, 'Payment Declined');
        },
        
        cancelled: () => {
            hideLoading();
            return show('Payment cancelled.', 'warning', 3000);
        }
    };
    
    // Game-specific notifications
    const game = {
        connected: () => show('Connected to game server', 'success', 3000),
        disconnected: () => show('Disconnected from server', 'error', 0, 'Connection Lost'),
        turnComplete: () => show('Turn completed', 'info', 2000),
        battleWon: () => show('Victory! You won the battle!', 'success', 5000, 'Battle Complete'),
        battleLost: () => show('Defeat. You lost the battle.', 'error', 5000, 'Battle Complete'),
        resourcesLow: () => show('Low resources! Build more extractors.', 'warning', 5000, 'Warning'),
        techUnlocked: (tech) => show(`${tech} researched!`, 'success', 4000, 'Technology Complete'),
        buildingComplete: (building) => show(`${building} construction complete!`, 'success', 4000, 'Building Complete')
    };
    
    return {
        initialize,
        show,
        remove,
        showLoading,
        hideLoading,
        confirm,
        payment,
        game
    };
})();

// Initialize on load
if (typeof window !== 'undefined') {
    window.NotificationSystem = NotificationSystem;
    document.addEventListener('DOMContentLoaded', () => {
        NotificationSystem.initialize();
    });
}