#!/usr/bin/env node
/**
 * Vendor the three.js addons the game needs into public/js/vendor/addons/.
 *
 * The project ships three.js as two hand-placed files rather than as a bundled
 * dependency, so `import ... from 'three'` inside an addon resolves to nothing
 * in the browser. Each vendored file gets its bare specifiers rewritten to the
 * local module. Re-run after bumping the three dependency.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'node_modules', 'three', 'examples', 'jsm');
const DEST = path.join(REPO, 'public', 'js', 'vendor', 'addons');

// Post-processing chain for bloom + FXAA, plus the shaders those passes pull in.
const FILES = [
    'postprocessing/EffectComposer.js',
    'postprocessing/Pass.js',
    'postprocessing/RenderPass.js',
    'postprocessing/ShaderPass.js',
    'postprocessing/MaskPass.js',
    'postprocessing/UnrealBloomPass.js',
    'postprocessing/OutputPass.js',
    'shaders/CopyShader.js',
    'shaders/LuminosityHighPassShader.js',
    'shaders/FXAAShader.js',
    'shaders/OutputShader.js'
];

function rewrite(contents, relPath) {
    const depth = relPath.split('/').length - 1; // files sit one dir deep
    const up = '../'.repeat(depth + 1);
    return contents
        .replace(/from\s+['"]three['"]/g, `from '${up}three.module.min.js'`)
        .replace(/from\s+['"]three\/addons\/([^'"]+)['"]/g, (_m, p) => `from '${up}addons/${p}'`);
}

function main() {
    if (!fs.existsSync(SRC)) {
        console.error(`three examples not found at ${SRC} — run npm install first`);
        process.exit(1);
    }
    let written = 0;
    for (const rel of FILES) {
        const from = path.join(SRC, rel);
        if (!fs.existsSync(from)) {
            console.error(`missing addon: ${rel}`);
            process.exitCode = 1;
            continue;
        }
        const to = path.join(DEST, rel);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.writeFileSync(to, rewrite(fs.readFileSync(from, 'utf8'), rel));
        console.log(`vendored ${rel}`);
        written++;
    }
    console.log(`\n${written} addon file(s) in public/js/vendor/addons/`);
}

main();
