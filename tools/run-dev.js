#!/usr/bin/env node
/**
 * Cross-platform local dev launcher.
 *
 * Defaults to mock DB mode so contributors can run the game without MySQL.
 * Pass --mysql to use the .env database settings instead.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const useMysql = args.includes('--mysql');
const noWatch = args.includes('--no-watch');
const portArg = args.find(arg => arg.startsWith('--port='));
const port = portArg ? portArg.split('=')[1] : (process.env.PORT || '3000');

function fileExists(relativePath) {
    return fs.existsSync(path.join(REPO, relativePath));
}

function resolveCommand() {
    if (!noWatch && fileExists('node_modules/nodemon/bin/nodemon.js')) {
        return {
            command: process.execPath,
            args: [path.join(REPO, 'node_modules', 'nodemon', 'bin', 'nodemon.js'), 'server/index.js']
        };
    }
    return {
        command: process.execPath,
        args: ['server/index.js']
    };
}

const childEnv = {
    ...process.env,
    PORT: port,
    ENABLE_TEST_GAME_MODE: process.env.ENABLE_TEST_GAME_MODE || '1'
};

if (!useMysql) {
    childEnv.USE_MOCK_DB = '1';
}

const { command, args: commandArgs } = resolveCommand();
console.log(`Starting Game of Worlds at http://localhost:${port}/login.html`);
console.log(useMysql ? 'Database: MySQL from .env' : 'Database: in-memory mock DB');

const child = spawn(command, commandArgs, {
    cwd: REPO,
    env: childEnv,
    stdio: 'inherit'
});

child.on('exit', code => {
    process.exit(code === null ? 1 : code);
});

child.on('error', error => {
    console.error(error.message || error);
    process.exit(1);
});
