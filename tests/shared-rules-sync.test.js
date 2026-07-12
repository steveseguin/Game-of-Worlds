const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const repoRoot = path.join(__dirname, '..');

test('client and server technology definitions remain byte-for-byte synchronized', () => {
    const serverTech = fs.readFileSync(path.join(__dirname, '..', 'server', 'lib', 'tech.js'), 'utf8')
        .replace(/\r\n/g, '\n');
    const clientTech = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'tech.js'), 'utf8')
        .replace(/\r\n/g, '\n');
    assert.equal(clientTech, serverTech,
        'server/lib/tech.js and public/js/tech.js must be updated together');
});

test('production game HTML does not load the stale client combat simulator', () => {
    const gameHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'game.html'), 'utf8');
    assert.doesNotMatch(gameHtml, /<script[^>]+src=["'][^"']*mechanics\.js/i,
        'public/js/mechanics.js has legacy ship balance and must not be loaded without being reconciled to server/lib/combat.js');
});

test('server-oriented legacy modules are not shipped from the public web root', () => {
    const forbiddenPublicModules = [
        path.join(repoRoot, 'public', 'js', 'events.js'),
        path.join(repoRoot, 'public', 'js', 'game_logic_ext.js'),
        path.join(repoRoot, 'public', 'js', 'mechanics.js')
    ];

    forbiddenPublicModules.forEach(modulePath => {
        assert.equal(fs.existsSync(modulePath), false, `${path.basename(modulePath)} must remain outside public/js`);
    });

    const deploySource = fs.readFileSync(path.join(repoRoot, 'tools', 'deploy.js'), 'utf8');
    forbiddenPublicModules.forEach(modulePath => {
        const relativePath = path.relative(repoRoot, modulePath).replace(/\\/g, '/');
        assert.match(deploySource, new RegExp(relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
            `${relativePath} must be explicitly removed from existing deployments`);
    });
});
