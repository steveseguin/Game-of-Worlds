# Contributing

Use `stable` as the starting branch for contribution work unless Steve says otherwise.

## Local Setup

```bash
git checkout stable
npm install
cp .env.example .env
npm run dev
```

The server runs on `http://localhost:3000` by default.

For quick local work without MySQL, set this in `.env` before starting the server:

```bash
USE_MOCK_DB=true
ENABLE_TEST_GAME_MODE=true
```

Mock database mode is in-memory only. Restarting the server resets local data.

If you want to test against MySQL instead, fill in `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`, then run `npm run setup`.

## Project Map

- `server/index.js` starts the HTTP/WebSocket server and serves static files.
- `server/server.js` owns the main game command routing and turn loop.
- `server/lib/` contains game systems such as races, combat, map generation, movement hazards, technology, victory, AI, payments, and validation.
- `public/` contains the browser UI. The main surfaces are `landing.html`, `login.html`, `lobby.html`, and `game.html`.
- `tests/` contains Node unit/integration tests. `tests/e2e/` contains Playwright browser flows.
- `docs/` contains deeper notes. Treat `README.md` and this file as the current contributor entry points.

## Tests

Run these before opening a pull request:

```bash
npm test
npm run test:integration
```

`npm run test:integration` starts `server/index.js` with `USE_MOCK_DB=1`, checks HTTP routes, and verifies that the server can boot without a local MySQL daemon.

Use browser tests when changing lobby, game UI, movement, combat, or multiplayer flows:

```bash
npm run test:e2e
```

The E2E script starts `server/index.js` in mock database mode, waits for `http://127.0.0.1:4173/login.html`, runs Playwright serially, and then stops the local server. You do not need MySQL for these tests. Set `E2E_PORT=####` if port `4173` is already busy.

For the broad visible gameplay path and screenshot artifacts:

```bash
npm run test:e2e:harness
```

Screenshots are written under `test-results/`, which is ignored by git.

For a quick manual local game:

1. Set `USE_MOCK_DB=true` in `.env`.
2. Run `npm run dev`.
3. Open `http://localhost:3000/login.html`.
4. Use guest login or create a test account.
5. Create a test game, add AI if needed, and start.

## Pull Requests

- Branch from `stable`.
- Keep changes focused on one bug, feature, or cleanup.
- Include screenshots or short screen recordings for visible UI changes.
- Do not commit `.env`, secrets, `node_modules`, `mysql_data`, `test-results`, or generated logs.
- Preserve the original risk/reward exploration personality documented in `AGENTS.md`.
- Server-side changes are welcome in PRs, but they need tests or a clear manual verification note because production deployment is owner-controlled.

## Production

External contributors should not deploy production. Steve or Codex will handle deployment and smoke testing after changes are accepted.

The repo includes an owner-only manual `Server Deploy` GitHub Action. It requires the repository secrets `PROD_SSH_HOST`, `PROD_SSH_USER`, and `PROD_SSH_PASSWORD`, and should be protected by the `production` environment. It runs tests first, then uses `tools/deploy.js` to upload `server/` and `public/`, restart the service, and smoke test the live server.
