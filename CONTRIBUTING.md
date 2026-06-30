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

For quick local work without MySQL, set this in `.env`:

```bash
USE_MOCK_DB=true
```

Mock database mode is in-memory only. Restarting the server resets local data.

## Tests

Run these before opening a pull request:

```bash
npm test
npm run test:integration
```

Use browser tests when changing lobby, game UI, movement, combat, or multiplayer flows:

```bash
npm run test:e2e
```

## Pull Requests

- Branch from `stable`.
- Keep changes focused on one bug, feature, or cleanup.
- Include screenshots or short screen recordings for visible UI changes.
- Do not commit `.env`, secrets, `node_modules`, `mysql_data`, `test-results`, or generated logs.
- Preserve the original risk/reward exploration personality documented in `AGENTS.md`.

## Production

External contributors should not deploy production. Steve or Codex will handle deployment and smoke testing after changes are accepted.
