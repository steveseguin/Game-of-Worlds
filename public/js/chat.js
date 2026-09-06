/**
 * chat.js - Client-side chat system for Game of Worlds
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
    let initialized = false;
    const HISTORY_LIMIT = 200;
    let chatHistory = [];
    let chatHistoryTime = [];
    let chatID = 1;
    let chatfadetimer = null;
    let chatfadebegin = null;
    let chatfadevalue = 100;
    let pendingOwnMessages = [];
    
    function initialize() {
        ensureChatFeed();
        if (initialized) return;
        initialized = true;
        // Set up chat form event handler
        document.getElementById('chatForm')?.addEventListener('submit', sendChat);
        document.getElementById('chatHistoryUp')?.addEventListener('click', showChatHistory);
        document.getElementById('chatHistoryDown')?.addEventListener('click', function() {
            showLatestChat(true);
        });
    }
    
    function sendChat(event) {
        event.preventDefault();
        const chatInput = document.getElementById("chat");
        if (chatInput && chatInput.value.trim() !== "") {
            const text = normalizeChatInput(chatInput.value);
            if (!text) {
                chatInput.value = "";
                return;
            }
            try {
                if (typeof websocket === 'undefined' || !websocket || websocket.readyState !== WebSocket.OPEN) {
                    throw new Error('Chat connection unavailable');
                }
                websocket.send(text);
            } catch (error) {
                const status = document.getElementById('chatSendStatus');
                if (status) status.textContent = 'Chat was not sent. Your draft is saved; retry when connected.';
                window.NotificationSystem?.notify?.('Chat not sent', 'Your draft is saved. Retry when connected.', 'warning', 6000);
                return;
            }
            const status = document.getElementById('chatSendStatus');
            if (status) status.textContent = '';
            pendingOwnMessages.push({ text, time: Date.now() });
            displayMessage(`You: ${text}`, { own: true });
            chatInput.value = "";
        }
    }
    
    function displayMessage(message, options = {}) {
        const logElement = document.getElementById('log');
        ensureChatFeed();

        if (!options.own && shouldSuppressOwnEcho(message)) {
            return;
        }
        
        const displayText = normalizeDisplayMessage(message);
        if (logElement) {
            logElement.textContent = displayText;
        }
        appendChatMessage(displayText, options.own);

        // Trim log if it gets too long
        if (logElement && logElement.textContent.length > 1500) {
            logElement.textContent = "..." + logElement.textContent.slice(-1500);
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
        chatHistory.push(logElement ? logElement.textContent : '');
        
        if (chatHistory.length > HISTORY_LIMIT) {
            chatHistory.shift();
            chatHistoryTime.shift();
        }
        // Update historical timestamps on demand, not in the hidden legacy panel every second.
        if (document.getElementById('chatHistoryReadout')?.hidden === false) {
            chatID = Math.min(chatID + 1, chatHistory.length);
        } else {
            showLatestChat();
        }
    }
    
    function showChatHistory() {
        if (!chatHistory.length) return;
        chatID = Math.min(chatID + 1, chatHistory.length);
        const index = chatHistory.length - chatID;
        const readout = document.getElementById('chatHistoryReadout');
        const messages = document.getElementById('chatMessages');
        if (readout && messages) {
            messages.hidden = true;
            readout.hidden = false;
            const age = Math.max(0, Math.round((Date.now() - chatHistoryTime[index]) / 1000));
            readout.textContent = `${chatHistory[index]} (${age} seconds ago)`;
        }
        updateTimeLog();
    }

    function showLatestChat(scrollToLatest = false) {
        chatID = 1;
        const readout = document.getElementById('chatHistoryReadout');
        const messages = document.getElementById('chatMessages');
        if (readout) readout.hidden = true;
        if (messages) messages.hidden = false;
        const feed = document.getElementById('chatFeed');
        if (scrollToLatest && feed) feed.scrollTop = feed.scrollHeight;
    }

    function updateTimeLog() {
        const d = new Date();
        const timeSince = document.getElementById('timeSince');
        if (timeSince && chatID > 0 && chatHistoryTime.length >= chatID) {
            timeSince.textContent = Math.round((d.getTime() - chatHistoryTime[chatHistoryTime.length - chatID]) / 1000) + " seconds ago";
        }
    }
    
    function startChatFade() {
        clearTimeout(chatfadetimer);
        clearTimeout(chatfadebegin);
        
        const updates = document.getElementById("empireupdates");
        if (!updates || !updates.getClientRects().length) return;
        
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
        feed.style.pointerEvents = 'auto';
        feed.tabIndex = 0;
        feed.setAttribute('role', 'region');
        feed.setAttribute('aria-label', 'Chat messages');
        feed.innerHTML = '<div id="chatMessages" role="log" aria-live="polite" aria-relevant="additions"></div>'
            + '<div id="chatHistoryReadout" class="chat-message" role="status" hidden></div>'
            + '<div id="chatSendStatus" role="status"></div>';
        chatContainer.parentNode.insertBefore(feed, chatContainer);
    }

    function appendChatMessage(message, own) {
        const messages = document.getElementById('chatMessages');
        if (!messages) return;

        const feed = document.getElementById('chatFeed');
        const followLatest = feed && !messages.hidden && feed.scrollHeight - feed.scrollTop - feed.clientHeight < 24;
        const row = document.createElement('div');
        row.className = `chat-message${own ? ' chat-message-own' : ''}`;
        row.textContent = message;
        messages.appendChild(row);

        while (messages.children.length > 8) {
            messages.removeChild(messages.firstChild);
        }

        if (followLatest) feed.scrollTop = feed.scrollHeight;
    }

    function shouldSuppressOwnEcho(message) {
        const now = Date.now();
        pendingOwnMessages = pendingOwnMessages.filter(entry => now - entry.time < 6000);
        const ownId = typeof getCookie === 'function' ? String(getCookie('userId') || '') : '';
        if (!/^\d+$/.test(ownId)) return false;
        const prefix = `Player ${ownId} says: `;
        if (!String(message).startsWith(prefix)) return false;
        const text = String(message).slice(prefix.length);
        const index = pendingOwnMessages.findIndex(entry => text === entry.text);
        if (index === -1) return false;
        pendingOwnMessages.splice(index, 1);
        return true;
    }

    function normalizeChatInput(value) {
        return String(value || '')
            .replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 500);
    }

    function normalizeDisplayMessage(value) {
        return String(value || '')
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, ' ')
            .slice(0, 800);
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
