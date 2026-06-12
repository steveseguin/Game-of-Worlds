/**
 * chat.js - Client-side chat system for Game of Words
 * 
 * Handles chat message display, history navigation, and message fading.
 * Provides methods for displaying messages, managing chat history, and
 * controlling the visual appearance of the chat UI.
 * 
 * This module is client-side only and does not directly access the database.
 * It communicates with the server via websocket messages to send chat messages.
 * 
 * Dependencies:
 * - None, but is used by connect.js and game.js
 */
const ChatSystem = (function() {
    let chatHistory = [];
    let chatHistoryTime = [];
    let timeSinceCounter = null;
    let chatID = 1;
    let chatfadetimer = null;
    let chatfadebegin = null;
    let chatfadevalue = 100;
    let pendingOwnMessages = [];
    
    function initialize() {
        ensureChatFeed();
        // Set up chat form event handler
        document.getElementById('chatForm')?.addEventListener('submit', sendChat);
        document.getElementById('chatHistoryUp')?.addEventListener('click', showChatHistory);
        document.getElementById('chatHistoryDown')?.addEventListener('click', function() {
            chatID = 0;
            showChatHistory();
        });
    }
    
    function sendChat(event) {
        event.preventDefault();
        const chatInput = document.getElementById("chat");
        if (chatInput && chatInput.value.trim() !== "") {
            const text = chatInput.value.trim();
            pendingOwnMessages.push({ text, time: Date.now() });
            displayMessage(`You: ${text}`, { own: true });
            if (typeof websocket !== 'undefined' && websocket && websocket.readyState === WebSocket.OPEN) {
                websocket.send(text);
            }
            chatInput.value = "";
        }
    }
    
    function displayMessage(message, options = {}) {
        const logElement = document.getElementById('log');
        ensureChatFeed();

        if (!options.own && shouldSuppressOwnEcho(message)) {
            return;
        }
        
        // Sanitize message to prevent XSS
        const sanitizedMessage = escapeHtml(message);
        if (logElement) {
            logElement.innerHTML = sanitizedMessage + "<br>";
        }
        appendChatMessage(sanitizedMessage, options.own);
        
        // Trim log if it gets too long
        if (logElement && logElement.innerHTML.length > 1500) {
            logElement.innerHTML = "..." + logElement.innerHTML.substring(
                logElement.innerHTML.length - 1500,
                logElement.innerHTML.length
            );
        }
        
        // Save to history
        pushLog();
        
        // Scroll to bottom
        if (logElement) {
            logElement.scrollTop = logElement.scrollHeight;
        }
        
        // Start fade effect
        startChatFade();
    }
    
    function pushLog() {
        const d = new Date();
        const timeSince = document.getElementById('timeSince');
        if (timeSince) timeSince.textContent = "0 seconds ago";
        
        chatHistoryTime.push(d.getTime());
        const logElement = document.getElementById("log");
        chatHistory.push(logElement ? logElement.innerHTML : '');
        
        clearInterval(timeSinceCounter);
        timeSinceCounter = setInterval(updateTimeLog, 1000);
        chatID = 1;
    }
    
    function showChatHistory() {
        chatID++;
        if (chatID > chatHistoryTime.length) {
            chatID = chatHistoryTime.length;
        }
        
        const d = new Date();
        const logElement = document.getElementById("log");
        const timeSince = document.getElementById('timeSince');
        
        if (logElement && chatHistory.length >= chatID) {
            logElement.innerHTML = chatHistory[chatHistory.length - chatID];
        }
        
        if (timeSince && chatHistoryTime.length >= chatID) {
            timeSince.textContent = Math.round((d.getTime() - chatHistoryTime[chatHistoryTime.length - chatID]) / 1000) + " seconds ago";
        }
        
        startChatFade();
    }
    
    function updateTimeLog() {
        const d = new Date();
        const timeSince = document.getElementById('timeSince');
        if (timeSince && chatHistoryTime.length >= chatID) {
            timeSince.textContent = Math.round((d.getTime() - chatHistoryTime[chatHistoryTime.length - chatID]) / 1000) + " seconds ago";
        }
    }
    
    function startChatFade() {
        clearTimeout(chatfadetimer);
        clearTimeout(chatfadebegin);
        
        const updates = document.getElementById("empireupdates");
        if (!updates) return;
        
        setAlpha(updates, 100);
        chatfadevalue = 100;
        chatfadebegin = setTimeout(() => chatFade(updates), 16000);
    }
    
    function chatFade(element) {
        if (chatfadevalue > 0) {
            chatfadevalue -= 2;
            setAlpha(element, chatfadevalue);
            chatfadetimer = setTimeout(() => chatFade(element), 60);
        }
    }
    
    function setAlpha(element, opacity) {
        if (!element) return;
        element.style.opacity = opacity / 100;
    }

    function ensureChatFeed() {
        if (document.getElementById('chatMessages')) return;

        const chatContainer = document.getElementById('chatContainer');
        if (!chatContainer || !chatContainer.parentNode) return;

        const feed = document.createElement('div');
        feed.id = 'chatFeed';
        feed.style.position = 'fixed';
        feed.style.left = '0';
        feed.style.bottom = '368px';
        feed.style.width = '500px';
        feed.style.maxWidth = '100%';
        feed.style.maxHeight = '140px';
        feed.style.overflow = 'hidden';
        feed.style.zIndex = '151';
        feed.style.padding = '4px';
        feed.style.boxSizing = 'border-box';
        feed.style.pointerEvents = 'none';
        feed.innerHTML = '<div id="chatMessages" style="display:flex;flex-direction:column;gap:4px;"></div>';
        chatContainer.parentNode.insertBefore(feed, chatContainer);
    }

    function appendChatMessage(sanitizedMessage, own) {
        const messages = document.getElementById('chatMessages');
        if (!messages) return;

        const row = document.createElement('div');
        row.className = `chat-message${own ? ' chat-message-own' : ''}`;
        row.innerHTML = sanitizedMessage;
        messages.appendChild(row);

        while (messages.children.length > 8) {
            messages.removeChild(messages.firstChild);
        }

        messages.scrollTop = messages.scrollHeight;
    }

    function shouldSuppressOwnEcho(message) {
        const now = Date.now();
        pendingOwnMessages = pendingOwnMessages.filter(entry => now - entry.time < 6000);
        const index = pendingOwnMessages.findIndex(entry => message.includes(`says: ${entry.text}`));
        if (index === -1) return false;
        pendingOwnMessages.splice(index, 1);
        return true;
    }
    
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    return {
        initialize,
        sendChat,
        displayMessage,
        showChatHistory,
        pushLog,
        updateTimeLog,
        startChatFade
    };
})();

// Initialize when document is loaded
document.addEventListener('DOMContentLoaded', function() {
    ChatSystem.initialize();
});

window.ChatSystem = ChatSystem;
