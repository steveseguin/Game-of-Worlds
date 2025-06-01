/**
 * lobby.js - Client-side game lobby manager
 * 
 * Manages the game lobby interface where players can create and join games.
 * Handles communication with the server for game management.
 */
let websocket;
let userId;
let tempKey;

// Initialize lobby
document.addEventListener('DOMContentLoaded', function() {
    // Get auth credentials from cookies
    userId = getCookie('userId');
    tempKey = getCookie('tempKey');
    
    if (!userId || !tempKey) {
        // No credentials, redirect to login
        window.location.href = '/login.html';
        return;
    }
    
    // Initialize WebSocket connection
    initWebSocket();
    
    // Set up event handlers
    document.getElementById('createGameBtn').addEventListener('click', createGame);
    document.getElementById('refreshGamesBtn').addEventListener('click', refreshGames);
});

function initWebSocket() {
    const serverUrl = `ws://${window.location.hostname}:1337`;
    websocket = new WebSocket(serverUrl);
    
    websocket.onopen = function() {
        console.log('Connected to server');
        // Authenticate
        websocket.send(`//auth:${userId}:${tempKey}`);
    };
    
    websocket.onmessage = function(evt) {
        handleMessage(evt.data);
    };
    
    websocket.onerror = function(evt) {
        console.error('WebSocket error:', evt);
    };
    
    websocket.onclose = function() {
        console.log('Disconnected from server');
        // Try to reconnect after delay
        setTimeout(initWebSocket, 3000);
    };
}

function handleMessage(message) {
    console.log('Received:', message);
    
    if (message.indexOf('lobby::') === 0) {
        // We're in the lobby
        refreshGames();
    } else if (message.indexOf('gamelist::') === 0) {
        // Update game list
        updateGameList(message);
    } else if (message.indexOf('races::') === 0) {
        // Handle race data response
        const raceData = message.substring(7);
        if (window.RaceSelection) {
            window.RaceSelection.handleUnlockedRaces(raceData);
        }
    } else if (message.indexOf('startgame::') === 0) {
        // Game is starting, redirect to game
        window.location.href = '/game.html';
    } else if (message.indexOf('Success: Joined game') === 0) {
        // Successfully joined a game, wait for start
        showWaitingMessage();
    }
}

function createGame() {
    const gameName = document.getElementById('gameName').value.trim();
    if (!gameName) {
        alert('Please enter a game name');
        return;
    }
    
    const maxPlayers = document.getElementById('maxPlayers').value;
    
    // For now, we'll create the game through direct database access
    // In production, this would be a WebSocket command
    alert('Game creation requires server-side implementation. For now, use the setup.js script to create games.');
}

function refreshGames() {
    // Request game list from server
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send('//gamelist');
    }
    
    // For now, show a sample game
    const gameList = document.getElementById('gameList');
    gameList.innerHTML = `
        <tr>
            <th>Game ID</th>
            <th>Name</th>
            <th>Players</th>
            <th>Status</th>
            <th>Action</th>
        </tr>
        <tr>
            <td>1</td>
            <td>Test Game</td>
            <td>1/4</td>
            <td>Waiting</td>
            <td><button onclick="joinGame(1)">Join</button></td>
        </tr>
    `;
}

function joinGame(gameId) {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        // Load race selection
        loadRaceSelectionScript(() => {
            window.RaceSelection.initialize((raceId) => {
                // Send join game request with selected race
                websocket.send(`//joingame:${gameId}:${raceId}`);
            });
        });
    }
}

function updateGameList(message) {
    // Parse game list from server
    const games = message.substring(10).split('|');
    const gameList = document.getElementById('gameList');
    
    let html = `
        <tr>
            <th>Game ID</th>
            <th>Name</th>
            <th>Players</th>
            <th>Status</th>
            <th>Action</th>
        </tr>
    `;
    
    if (games.length === 0 || games[0] === '') {
        html += '<tr><td colspan="5">No games available</td></tr>';
    } else {
        games.forEach(gameData => {
            const [id, name, players, maxPlayers, status] = gameData.split(',');
            html += `
                <tr>
                    <td>${id}</td>
                    <td>${name}</td>
                    <td>${players}/${maxPlayers}</td>
                    <td>${status}</td>
                    <td>
                        ${status === 'waiting' ? 
                            `<button onclick="joinGame(${id})">Join</button>` : 
                            'In Progress'}
                    </td>
                </tr>
            `;
        });
    }
    
    gameList.innerHTML = html;
}

function showWaitingMessage() {
    const gameList = document.getElementById('gameList');
    gameList.innerHTML = `
        <tr>
            <td colspan="5" style="text-align: center; padding: 20px;">
                <h3>Joined game successfully!</h3>
                <p>Waiting for the game creator to start the game...</p>
                <button onclick="window.location.reload()">Leave Game</button>
            </td>
        </tr>
    `;
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function loadRaceSelectionScript(callback) {
    if (window.RaceSelection) {
        callback();
        return;
    }
    
    const script = document.createElement('script');
    script.src = 'race-selection.js';
    script.onload = () => {
        // Request unlocked races from server
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send('//getunlockedraces');
        }
        callback();
    };
    document.head.appendChild(script);
}

// Make joinGame globally accessible
window.joinGame = joinGame;