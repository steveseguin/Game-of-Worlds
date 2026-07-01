# Agent Documentation

This folder is the AI-oriented operating map for Game of Words. It is meant for Codex, future agents, and contributors who need to understand the live server and gameplay flow quickly enough to make safe changes.

## Source Of Truth

Use these docs as a map, not as a replacement for code. When docs and code disagree, inspect the code first and update the docs in the same change.

Primary live runtime files:

- `server/index.js`: HTTP server, static files, auth-gated pages, status endpoints, WebSocket bootstrap.
- `server/server.js`: main game engine, lobby flow, WebSocket command handlers, turn loop, movement, battle, AI, standing orders.
- `server/lib/*`: supporting systems for races, combat, tech, map generation, victory, payments, mock DB, and validation.
- `public/js/connect.js`: in-game WebSocket client, message parsing, game-state updates.
- `public/js/lobby.js`: lobby WebSocket client and pre-game user journey.
- `.github/workflows/*.yml` and `tools/*.js`: CI, deploy, local dev, E2E, and production status tooling.

## Index

- [Code Map](maps/code-map.md)
- [HTTP API](server/http-api.md)
- [HTTP Request Flow](server/http-request-flow.md)
- [WebSocket Protocol](server/websocket-protocol.md)
- [Signaling And Errors](server/signaling-and-errors.md)
- [Game Lifecycle And Cleanup](server/game-lifecycle.md)
- [Persistence Model](server/persistence.md)
- [Gameplay Mechanics](gameplay/mechanics.md)
- [Movement Flow](gameplay/movement-flow.md)
- [State Model](gameplay/state-model.md)
- [Turn Resolution Flow](gameplay/turn-resolution-flow.md)
- [User Journey](gameplay/user-journey.md)
- [Turn Engine](gameplay/turn-engine.md)
- [CI/CD And Deploy](operations/ci-cd.md)
- [Risk Register](reviews/risk-register.md)
- [Security Review Notes](reviews/security-review.md)

## Maintenance Rules

- Add a doc note when a gameplay mechanic, wire message, endpoint, persistent table, or deployment behavior changes.
- Prefer exact command names and message prefixes over prose-only descriptions.
- Keep legacy modules labeled as legacy if they are no longer the live path.
- Record known uncertainty in `reviews/risk-register.md` instead of burying it in comments.
