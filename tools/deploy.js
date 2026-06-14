#!/usr/bin/env node
/**
 * tools/deploy.js — Deploy changed files to production over SSH (ssh2 lib).
 *
 * Usage:
 *   node tools/deploy.js                # upload file list + restart + smoke test
 *   node tools/deploy.js --no-restart   # upload only
 *
 * Credentials come from secrets/readme/claude/agents/ssh (Host/User/Password lines).
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

const REPO = path.resolve(__dirname, '..');
const REMOTE_ROOT = '/opt/game-of-worlds';

// Files to ship. Keep this explicit so we never push junk to production.
const FILES = [
    'server/server.js',
    'server/index.js',
    'server/lib/tech.js',
    'server/lib/map.js',
    'server/lib/victory.js',
    'server/lib/combat.js',
    'server/lib/mock-db.js',
    'public/landing.html',
    'public/css/landing.css',
    'public/js/landing.js',
    'public/login.html',
    'public/css/auth.css',
    'public/images/type8.gif',
    'public/images/spacebak.jpg',
    'public/images/title2.png',
    'public/images/type1.gif',
    'public/images/type2.gif',
    'public/images/dreadnaught.png',
    'public/images/metal.png',
    'public/images/crystal.png',
    'public/images/research.png',
    'public/lobby.html',
    'public/js/lobby.js',
    'public/game.html',
    'public/css/style.css',
    'public/js/galaxy3d.js',
    'public/js/battle3d.js',
    'public/js/vendor/three.module.min.js',
    'public/js/vendor/three.core.min.js',
    'public/js/ui.js',
    'public/js/minimap.js',
    'public/js/connect.js',
    'public/js/game-screen.js',
    'public/js/game.js',
    'public/js/tech.js',
    'public/js/GUI.js',
    'public/js/controlpad.js',
    'public/js/tour.js',
    'public/js/combat-analytics.js',
    'public/js/advisor.js',
    'public/js/onboarding.js',
    'public/js/battle.js'
];

function loadCredentials() {
    const raw = fs.readFileSync(path.join(REPO, 'secrets/readme/claude/agents/ssh'), 'utf8');
    const get = label => {
        const match = raw.match(new RegExp(`${label}:\\s*(.+)`));
        return match ? match[1].trim() : null;
    };
    return { host: get('Host'), username: get('User'), password: get('Password') };
}

function connect(creds) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        conn.on('ready', () => resolve(conn));
        conn.on('error', reject);
        conn.connect({ host: creds.host, port: 22, username: creds.username, password: creds.password, readyTimeout: 20000 });
    });
}

function exec(conn, command) {
    return new Promise((resolve, reject) => {
        conn.exec(command, (err, stream) => {
            if (err) return reject(err);
            let out = '';
            let errOut = '';
            stream.on('close', code => resolve({ code, out, errOut }));
            stream.on('data', data => { out += data; });
            stream.stderr.on('data', data => { errOut += data; });
        });
    });
}

function sftpSession(conn) {
    return new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)));
    });
}

function upload(sftp, local, remote) {
    return new Promise((resolve, reject) => {
        sftp.fastPut(local, remote, err => (err ? reject(err) : resolve()));
    });
}

async function main() {
    const noRestart = process.argv.includes('--no-restart');
    const creds = loadCredentials();
    if (!creds.host || !creds.password) {
        console.error('Could not parse SSH credentials.');
        process.exit(1);
    }

    console.log(`Connecting to ${creds.username}@${creds.host} ...`);
    const conn = await connect(creds);
    const sftp = await sftpSession(conn);

    // Ensure new directories exist before uploading into them.
    const dirs = [...new Set(FILES.map(f => path.posix.dirname(`${REMOTE_ROOT}/${f}`)))];
    for (const dir of dirs) {
        await exec(conn, `mkdir -p '${dir}'`);
    }

    // Back up server files we overwrite (single rolling backup).
    await exec(conn, `mkdir -p ${REMOTE_ROOT}/.deploy-backup && cp -f ${REMOTE_ROOT}/server/server.js ${REMOTE_ROOT}/server/index.js ${REMOTE_ROOT}/.deploy-backup/ 2>/dev/null; true`);

    for (const file of FILES) {
        const local = path.join(REPO, file);
        if (!fs.existsSync(local)) {
            console.log(`  SKIP  ${file} (missing locally)`);
            continue;
        }
        const remote = `${REMOTE_ROOT}/${file.replace(/\\/g, '/')}`;
        await upload(sftp, local, remote);
        console.log(`  PUT   ${file}`);
    }

    if (!noRestart) {
        console.log('Restarting game-of-worlds service ...');
        const restart = await exec(conn, 'systemctl restart game-of-worlds && sleep 2 && systemctl is-active game-of-worlds');
        console.log(`  service: ${restart.out.trim() || restart.errOut.trim()}`);

        const smoke = await exec(conn, "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ ; echo ' /'; curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/lobby.html; echo ' /lobby.html'");
        console.log(`  smoke: ${smoke.out.trim().replace(/\n/g, ' | ')}`);

        const logs = await exec(conn, 'journalctl -u game-of-worlds -n 12 --no-pager | tail -12');
        console.log('--- recent logs ---');
        console.log(logs.out.trim());
    }

    conn.end();
    console.log('Done.');
}

main().catch(err => {
    console.error('Deploy failed:', err.message);
    process.exit(1);
});
