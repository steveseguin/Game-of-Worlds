/**
 * Static asset compression.
 *
 * The landing page ships ~1.1 MB of JavaScript on a machine with a GPU and this
 * server used to send every byte of it raw. These tests pin the two halves of the
 * fix: that the right encoding is chosen for a real Accept-Encoding header, and
 * that the server actually puts compressed bytes on the wire for text while
 * leaving images and fonts alone.
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const net = require('net');

const REPO = path.resolve(__dirname, '..');

/* ---------- the negotiator, in isolation ----------
   Extracted rather than required, because server/index.js opens database pools and
   binds a port at require() time. The body is kept byte-identical to the original;
   if it drifts, the server tests below still catch a real regression. */
function negotiateEncoding(acceptEncoding) {
    const header = String(acceptEncoding || '').toLowerCase().trim();
    if (!header) return null;
    const q = { br: -1, gzip: -1, '*': -1 };
    for (const part of header.split(',')) {
        const [rawName, ...params] = part.trim().split(';');
        const name = rawName.trim();
        if (!(name in q)) continue;
        let weight = 1;
        for (const p of params) {
            const m = /^\s*q=([0-9.]+)\s*$/.exec(p);
            if (m) weight = parseFloat(m[1]);
        }
        if (Number.isFinite(weight)) q[name] = weight;
    }
    if (q.br < 0 && q['*'] > 0) q.br = q['*'];
    if (q.gzip < 0 && q['*'] > 0) q.gzip = q['*'];
    if (q.br > 0 && q.br >= q.gzip) return 'br';
    if (q.gzip > 0) return 'gzip';
    return null;
}

test('negotiateEncoding picks brotli for the common browser header', () => {
    // The header Chrome, Firefox and Safari all send. The first implementation of
    // this returned 'gzip' here, which is exactly the bug worth a test.
    assert.strictEqual(negotiateEncoding('gzip, deflate, br'), 'br');
    assert.strictEqual(negotiateEncoding('gzip, deflate, br, zstd'), 'br');
});

test('negotiateEncoding falls back to gzip when brotli is absent', () => {
    assert.strictEqual(negotiateEncoding('gzip, deflate'), 'gzip');
    assert.strictEqual(negotiateEncoding('gzip'), 'gzip');
});

test('negotiateEncoding honours q=0 as a refusal', () => {
    assert.strictEqual(negotiateEncoding('br;q=0, gzip'), 'gzip');
    assert.strictEqual(negotiateEncoding('gzip;q=0'), null);
    assert.strictEqual(negotiateEncoding('br;q=0, gzip;q=0'), null);
});

test('negotiateEncoding respects explicit q ordering', () => {
    assert.strictEqual(negotiateEncoding('gzip;q=1.0, br;q=0.8'), 'gzip');
    assert.strictEqual(negotiateEncoding('gzip;q=0.5, br;q=0.9'), 'br');
});

test('negotiateEncoding returns null when nothing is on offer', () => {
    assert.strictEqual(negotiateEncoding(''), null);
    assert.strictEqual(negotiateEncoding(null), null);
    assert.strictEqual(negotiateEncoding(undefined), null);
    assert.strictEqual(negotiateEncoding('identity'), null);
    assert.strictEqual(negotiateEncoding('deflate'), null);
});

test('negotiateEncoding handles wildcards and stray whitespace', () => {
    assert.strictEqual(negotiateEncoding('*'), 'br');
    assert.strictEqual(negotiateEncoding('  gzip  '), 'gzip');
    assert.strictEqual(negotiateEncoding('BR'), 'br');
});

/* ---------- the server, end to end ---------- */

function freePort() {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        s.on('error', reject);
        s.listen(0, '127.0.0.1', () => {
            const { port } = s.address();
            s.close(() => resolve(String(port)));
        });
    });
}

function get(port, urlPath, headers) {
    return new Promise((resolve, reject) => {
        const req = http.get(
            { host: '127.0.0.1', port, path: urlPath, headers },
            res => {
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks)
                }));
            }
        );
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    });
}

async function waitFor(port, deadlineMs = 60000) {
    const end = Date.now() + deadlineMs;
    while (Date.now() < end) {
        try {
            await get(port, '/landing.html', {});
            return;
        } catch {
            await new Promise(r => setTimeout(r, 300));
        }
    }
    throw new Error('server did not come up');
}

test('static text assets are compressed, binary assets are not', async (t) => {
    const port = await freePort();
    const child = spawn(process.execPath, [path.join(REPO, 'server', 'index.js')], {
        cwd: REPO,
        env: { ...process.env, PORT: port, USE_MOCK_DB: 'true', NODE_ENV: 'test' },
        stdio: 'ignore'
    });
    t.after(() => child.kill());

    await waitFor(port);

    const BROWSER = { 'accept-encoding': 'gzip, deflate, br' };

    // --- the big one: the renderer module ---
    const three = await get(port, '/js/vendor/three.core.min.js', BROWSER);
    assert.strictEqual(three.status, 200);
    assert.strictEqual(three.headers['content-encoding'], 'br');
    assert.strictEqual(three.headers['vary'], 'Accept-Encoding');
    const threeRaw = zlib.brotliDecompressSync(three.body);
    // It must actually be smaller, and by a lot: this file is the reason the
    // feature exists.
    assert.ok(three.body.length < threeRaw.length * 0.45,
        `three.core.min.js only compressed to ${three.body.length}/${threeRaw.length}`);

    // --- identity is still correct bytes ---
    const plain = await get(port, '/js/vendor/three.core.min.js', {});
    assert.strictEqual(plain.headers['content-encoding'], undefined);
    assert.ok(plain.body.equals(threeRaw), 'brotli round-trip must equal the identity body');

    // --- gzip path ---
    const gz = await get(port, '/css/landing.min.css', { 'accept-encoding': 'gzip' });
    assert.strictEqual(gz.headers['content-encoding'], 'gzip');
    const gzRaw = zlib.gunzipSync(gz.body);
    const cssPlain = await get(port, '/css/landing.min.css', {});
    assert.ok(gzRaw.equals(cssPlain.body), 'gzip round-trip must equal the identity body');

    // --- html ---
    const html = await get(port, '/landing.html', BROWSER);
    assert.strictEqual(html.headers['content-encoding'], 'br');
    assert.ok(zlib.brotliDecompressSync(html.body).includes('GAME OF WORLDS'));

    // --- already-compressed formats are left alone ---
    const jpg = await get(port, '/images/spacebak.jpg', BROWSER);
    assert.strictEqual(jpg.status, 200);
    assert.strictEqual(jpg.headers['content-encoding'], undefined,
        'a JPEG must not be run through brotli');
    assert.strictEqual(jpg.headers['vary'], undefined);

    // --- Content-Length must describe the bytes actually sent ---
    assert.strictEqual(Number(three.headers['content-length']), three.body.length);
    assert.strictEqual(Number(gz.headers['content-length']), gz.body.length);

    // --- second request hits the cache and must be byte-identical ---
    const again = await get(port, '/js/vendor/three.core.min.js', BROWSER);
    assert.ok(again.body.equals(three.body), 'cached compressed body must not drift');
});
