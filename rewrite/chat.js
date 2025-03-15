// rewrite/chat.js - Complete implementation

const ChatSystem = (function() {
    let chatHistory = [];
    let chatHistoryTime = [];
    let timeSinceCounter = null;
    let chatID = 1;
    let chatfadetimer = null;
    let chatfadebegin = null;
    let chatfadevalue = 100;
    
    function initialize() {
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
            websocket.send(chatInput.value);
            chatInput.value = "";
        }
    }
    
    function displayMessage(message) {
        const logElement = document.getElementById('log');
        if (!logElement) return;
        
        logElement.innerHTML = message + "<br>";
        
        // Trim log if it gets too long
        if (logElement.innerHTML.length > 1500) {
            logElement.innerHTML = "..." + logElement.innerHTML.substring(
                logElement.innerHTML.length - 1500,
                logElement.innerHTML.length
            );
        }
        
        // Save to history
        pushLog();
        
        // Scroll to bottom
        logElement.scrollTop = logElement.scrollHeight;
        
        // Start fade effect
        startChatFade();
    }
    
    function pushLog() {
        const d = new Date();
        const timeSince = document.getElementById('timeSince');
        if (timeSince) timeSince.innerHTML = "0 seconds ago";
        
        chatHistoryTime.push(d.getTime());
        chatHistory.push(document.getElementById("log").innerHTML);
        
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
            timeSince.innerHTML = Math.round((d.getTime() - chatHistoryTime[chatHistoryTime.length - chatID]) / 1000) + " seconds ago";
        }
        
        startChatFade();
    }
    
    function updateTimeLog() {
        const d = new Date();
        const timeSince = document.getElementById('timeSince');
        if (timeSince && chatHistoryTime.length >= chatID) {
            timeSince.innerHTML = Math.round((d.getTime() - chatHistoryTime[chatHistoryTime.length - chatID]) / 1000) + " seconds ago";
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
    
    return {
        initialize,
        sendChat,
        displayMessage,
        showChatHistory
    };
})();