/**
 * test-server.js - Simple test to verify server functionality
 */
const http = require('http');
const mysql2 = require('mysql2');

if (process.env.NODE_TEST_CONTEXT) {
    console.log('Skipping manual integration test during node --test run.');
    process.exit(0);
}

// Test database connection
const db = mysql2.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'game'
});

db.connect(err => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        console.log('\nMake sure MySQL is running and the database exists.');
        console.log('Run: node setup.js');
        process.exit(1);
    }
    
    console.log('✅ Database connection successful');
    
    // Test table existence
    db.query('SHOW TABLES', (err, results) => {
        if (err) {
            console.error('❌ Error checking tables:', err);
            db.end();
            return;
        }
        
        console.log('✅ Tables found:', results.length);
        results.forEach(row => {
            const tableName = Object.values(row)[0];
            console.log('  -', tableName);
        });
        
        // Test server startup
        const server = http.createServer((req, res) => {
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end('Test server running');
        });
        
        server.listen(1337, () => {
            console.log('✅ HTTP server listening on port 1337');
            console.log('\nAll tests passed! The game server should work.');
            console.log('Press Ctrl+C to exit.');
        });
        
        server.on('error', err => {
            if (err.code === 'EADDRINUSE') {
                console.error('❌ Port 1337 is already in use');
                console.log('Another instance might be running.');
            } else {
                console.error('❌ Server error:', err);
            }
            db.end();
            process.exit(1);
        });
    });
});

// Handle cleanup
process.on('SIGINT', () => {
    console.log('\nShutting down test server...');
    db.end();
    process.exit(0);
});
