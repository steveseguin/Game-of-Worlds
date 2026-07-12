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
const os = require('os');
const { execSync } = require('child_process');
const { Client } = require('ssh2');

const REPO = path.resolve(__dirname, '..');
const REMOTE_ROOT = '/opt/game-of-worlds';
const DEPLOY_TMP = path.join(REPO, '.deploy-tmp');

const DELETE_FILES = [
    'public/index.html',
    'public/js/events.js',
    'public/js/game_logic_ext.js',
    'public/js/mechanics.js'
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

function gitValue(command, fallback = null) {
    try {
        return execSync(command, {
            cwd: REPO,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim() || fallback;
    } catch {
        return fallback;
    }
}

function buildDeployInfo() {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    const gitStatus = gitValue('git status --porcelain', '');
    const gitCommit = gitValue('git rev-parse HEAD');

    return {
        deployedAt: new Date().toISOString(),
        source: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local',
        repository: process.env.GITHUB_REPOSITORY || gitValue('git config --get remote.origin.url'),
        branch: process.env.DEPLOY_REF_NAME || process.env.GITHUB_REF_NAME || gitValue('git branch --show-current'),
        ref: process.env.DEPLOY_REF || process.env.GITHUB_REF || null,
        commit: process.env.DEPLOY_COMMIT || gitCommit || process.env.GITHUB_SHA || null,
        shortCommit: (process.env.DEPLOY_COMMIT || gitCommit || process.env.GITHUB_SHA || '').slice(0, 12) || null,
        runId: process.env.GITHUB_RUN_ID || null,
        runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
        actor: process.env.GITHUB_ACTOR || os.userInfo().username,
        workflow: process.env.GITHUB_WORKFLOW || null,
        packageName: pkg.name,
        packageVersion: pkg.version,
        dirty: Boolean(gitStatus)
    };
}

function writeDeployInfo(deployInfo) {
    fs.mkdirSync(DEPLOY_TMP, { recursive: true });
    const localPath = path.join(DEPLOY_TMP, 'deploy-info.json');
    fs.writeFileSync(localPath, `${JSON.stringify(deployInfo, null, 2)}\n`);
    return localPath;
}

function shQuote(value) {
    return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function actionEscape(value) {
    return String(value)
        .replace(/%/g, '%25')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A');
}

function emitActionError(message) {
    if (process.env.GITHUB_ACTIONS === 'true') {
        console.error(`::error::${actionEscape(message)}`);
    }
}

function appendActionSummary(markdown) {
    if (!process.env.GITHUB_STEP_SUMMARY) {
        return;
    }
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown.trimEnd()}\n\n`);
}

function remoteFailureMessage(label, result) {
    const stdout = result.out.trim();
    const stderr = result.errOut.trim();
    return [
        `${label} failed with exit code ${result.code}.`,
        stdout ? `stdout:\n${stdout}` : null,
        stderr ? `stderr:\n${stderr}` : null
    ].filter(Boolean).join('\n\n');
}

async function execChecked(conn, label, command) {
    const result = await exec(conn, command);
    if (result.code !== 0) {
        throw new Error(remoteFailureMessage(label, result));
    }
    return result;
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
    const deployInfo = buildDeployInfo();
    const deployInfoPath = writeDeployInfo(deployInfo);

    const creds = loadCredentials();
    const missing = [];
    if (!creds.host) missing.push('DEPLOY_HOST');
    if (!creds.username) missing.push('DEPLOY_USER');
    if (!creds.password) missing.push('DEPLOY_PASSWORD');
    if (missing.length > 0) {
        throw new Error(`Missing SSH deployment credentials: ${missing.join(', ')}`);
    }

    let conn = null;
    try {
        console.log(`Deploying ${deployInfo.shortCommit || 'unknown commit'} from ${deployInfo.branch || 'unknown ref'}`);
        console.log(`Connecting to ${creds.username}@${creds.host} ...`);
        conn = await connect(creds);
        const sftp = await sftpSession(conn);

        // Ensure new directories exist before uploading into them.
        const dirs = [...new Set(files.map(f => path.posix.dirname(`${REMOTE_ROOT}/${f}`)))];
        for (const dir of dirs) {
            await execChecked(conn, `mkdir ${dir}`, `mkdir -p ${shQuote(dir)}`);
        }

        // Back up server files we overwrite (single rolling backup).
        const backupDir = `${REMOTE_ROOT}/.deploy-backup`;
        await execChecked(
            conn,
            'prepare rolling backup',
            `mkdir -p ${shQuote(backupDir)} && cp -f ${shQuote(`${REMOTE_ROOT}/server/server.js`)} ${shQuote(`${REMOTE_ROOT}/server/index.js`)} ${shQuote(backupDir)} 2>/dev/null || true`
        );

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

        await upload(sftp, deployInfoPath, `${REMOTE_ROOT}/server/deploy-info.json`);
        console.log('  PUT   server/deploy-info.json');

        for (const file of DELETE_FILES) {
            const remote = `${REMOTE_ROOT}/${file.replace(/\\/g, '/')}`;
            await execChecked(conn, `remove ${file}`, `rm -f ${shQuote(remote)}`);
            console.log(`  RM    ${file}`);
        }

        if (!noRestart) {
            if (installDeps) {
                console.log('Installing production dependencies ...');
                await execChecked(conn, 'npm ci --omit=dev', `cd ${shQuote(REMOTE_ROOT)} && npm ci --omit=dev`);
                console.log('  dependencies: installed');
            }

            console.log('Restarting game-of-worlds service ...');
            const restart = await execChecked(conn, 'restart game-of-worlds', 'systemctl restart game-of-worlds && sleep 2 && systemctl is-active game-of-worlds');
            console.log(`  service: ${restart.out.trim() || restart.errOut.trim()}`);

            const smoke = await execChecked(conn, 'local HTTP smoke', "curl -s -o /dev/null -w '%{http_code} /\\n' http://localhost:3000/; curl -s -o /dev/null -w '%{http_code} /lobby.html\\n' http://localhost:3000/lobby.html; curl -s -o /dev/null -w '%{http_code} /health\\n' http://localhost:3000/health");
            console.log(`  smoke: ${smoke.out.trim().replace(/\n/g, ' | ')}`);
            if (!/^200 \/$/m.test(smoke.out) || !/^302 \/lobby\.html$/m.test(smoke.out) || !/^200 \/health$/m.test(smoke.out)) {
                throw new Error(`Smoke test failed: ${smoke.out.trim() || smoke.errOut.trim()}`);
            }

            const logs = await exec(conn, 'journalctl -u game-of-worlds -n 12 --no-pager | tail -12');
            console.log('--- recent logs ---');
            console.log(logs.out.trim());
        }

        appendActionSummary(`## Deploy\n\n- Commit: \`${deployInfo.shortCommit || 'unknown'}\`\n- Branch/ref: \`${deployInfo.branch || 'unknown'}\`\n- Files uploaded: ${files.length}\n- Install dependencies: ${installDeps ? 'yes' : 'no'}\n- Restarted service: ${noRestart ? 'no' : 'yes'}`);
    } finally {
        if (conn) {
            conn.end();
        }
    }
    console.log('Done.');
}

main().catch(err => {
    emitActionError(err.message);
    appendActionSummary(`## Deploy failed\n\n\`\`\`text\n${err.message}\n\`\`\``);
    console.error('Deploy failed:', err.message);
    process.exit(1);
});
