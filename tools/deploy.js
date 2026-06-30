#!/usr/bin/env node
/**
 * tools/deploy.js - Deploy app files to production over SSH (ssh2 lib).
 *
 * Usage:
 *   node tools/deploy.js                # upload server/public files + restart + smoke test
 *   node tools/deploy.js --no-restart   # upload only
 *   node tools/deploy.js --list         # print deploy file list and exit
 *   node tools/deploy.js --install      # upload package files and npm ci --omit=dev before restart
 *
 * Credentials come from environment variables first:
 *   DEPLOY_HOST / DEPLOY_USER / DEPLOY_PASSWORD
 * Local fallback:
 *   secrets/readme/claude/agents/ssh (Host/User/Password lines).
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('ssh2');

const REPO = path.resolve(__dirname, '..');
const REMOTE_ROOT = '/opt/game-of-worlds';

const DELETE_FILES = [
    'public/index.html'
];

function walkFiles(rootDir) {
    const absRoot = path.join(REPO, rootDir);
    if (!fs.existsSync(absRoot)) {
        return [];
    }

    const out = [];
    const stack = [absRoot];
    while (stack.length > 0) {
        const current = stack.pop();
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const abs = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(abs);
            } else if (entry.isFile()) {
                out.push(path.relative(REPO, abs).replace(/\\/g, '/'));
            }
        }
    }
    return out.sort();
}

function collectDeployFiles() {
    return [
        'package.json',
        'package-lock.json',
        ...walkFiles('server'),
        ...walkFiles('public')
    ];
}

function loadCredentials() {
    if (process.env.DEPLOY_HOST && process.env.DEPLOY_USER && process.env.DEPLOY_PASSWORD) {
        return {
            host: process.env.DEPLOY_HOST,
            username: process.env.DEPLOY_USER,
            password: process.env.DEPLOY_PASSWORD
        };
    }

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
    const installDeps = process.argv.includes('--install');
    const files = collectDeployFiles();
    if (process.argv.includes('--list')) {
        console.log(files.join('\n'));
        console.log(`\n${files.length} files`);
        return;
    }

    const creds = loadCredentials();
    if (!creds.host || !creds.password) {
        console.error('Could not parse SSH credentials.');
        process.exit(1);
    }

    console.log(`Connecting to ${creds.username}@${creds.host} ...`);
    const conn = await connect(creds);
    const sftp = await sftpSession(conn);

    // Ensure new directories exist before uploading into them.
    const dirs = [...new Set(files.map(f => path.posix.dirname(`${REMOTE_ROOT}/${f}`)))];
    for (const dir of dirs) {
        await exec(conn, `mkdir -p '${dir}'`);
    }

    // Back up server files we overwrite (single rolling backup).
    await exec(conn, `mkdir -p ${REMOTE_ROOT}/.deploy-backup && cp -f ${REMOTE_ROOT}/server/server.js ${REMOTE_ROOT}/server/index.js ${REMOTE_ROOT}/.deploy-backup/ 2>/dev/null; true`);

    for (const file of files) {
        const local = path.join(REPO, file);
        if (!fs.existsSync(local)) {
            console.log(`  SKIP  ${file} (missing locally)`);
            continue;
        }
        const remote = `${REMOTE_ROOT}/${file.replace(/\\/g, '/')}`;
        await upload(sftp, local, remote);
        console.log(`  PUT   ${file}`);
    }

    for (const file of DELETE_FILES) {
        const remote = `${REMOTE_ROOT}/${file.replace(/\\/g, '/')}`;
        await exec(conn, `rm -f '${remote}'`);
        console.log(`  RM    ${file}`);
    }

    if (!noRestart) {
        if (installDeps) {
            console.log('Installing production dependencies ...');
            const install = await exec(conn, `cd ${REMOTE_ROOT} && npm ci --omit=dev`);
            if (install.code !== 0) {
                throw new Error(`npm install failed: ${install.errOut || install.out}`);
            }
            console.log('  dependencies: installed');
        }

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
