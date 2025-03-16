const LobbySystem = (function() {
    function initialize() {
        // Get available games
        fetchGames();
        
        // Setup event listeners
        document.getElementById('createGameBtn')?.addEventListener('click', createGame);
        document.getElementById('refreshGamesBtn')?.addEventListener('click', fetchGames);
    }
    
    function fetchGames() {
        const gameList = document.getElementById('gameList');
        if (!gameList) return;
        
        // Clear existing list
        gameList.innerHTML = '<tr><th>Game ID</th><th>Name</th><th>Players</th><th>Status</th><th>Action</th></tr>';
        
        // Fetch games from server
        fetch('/games')
            .then(response => response.json())
            .then(games => {
                if (games.length === 0) {
                    const row = document.createElement('tr');
                    row.innerHTML = '<td colspan="5">No games available. Create a new one!</td>';
                    gameList.appendChild(row);
                    return;
                }
                
                games.forEach(game => {
                    const row = document.createElement('tr');
                    
                    // Create join button
                    const joinBtn = document.createElement('button');
                    joinBtn.textContent = game.status === 'waiting' ? 'Join' : 'Spectate';
                    joinBtn.onclick = () => joinGame(game.id);
                    
                    row.innerHTML = `
                        <td>${game.id}</td>
                        <td>${game.name}</td>
                        <td>${game.players}/${game.maxPlayers}</td>
                        <td>${game.status}</td>
                        <td></td>
                    `;
                    
                    row.querySelector('td:last-child').appendChild(joinBtn);
                    gameList.appendChild(row);
                });
            })
            .catch(error => {
                console.error('Error fetching games:', error);
                gameList.innerHTML = '<tr><td colspan="5">Error loading games. Please try again.</td></tr>';
            });
    }
    
    function createGame() {
        const gameName = document.getElementById('gameName').value;
        if (!gameName) {
            alert('Please enter a game name');
            return;
        }
        
        const maxPlayers = document.getElementById('maxPlayers').value || 4;
        
        fetch('/create-game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: gameName, maxPlayers })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert(`Game created with ID: ${data.gameId}`);
                fetchGames();
            } else {
                alert(`Error: ${data.message}`);
            }
        })
        .catch(error => {
            console.error('Error creating game:', error);
            alert('Failed to create game. Please try again.');
        });
    }
    
    function joinGame(gameId) {
        websocket.send(`//joingame:${gameId}`);
    }
    
    return {
        initialize,
        fetchGames
    };
})();

document.addEventListener('DOMContentLoaded', LobbySystem.initialize);