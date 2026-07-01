# Security Review Notes

Primary sources: `server/index.js`, `server/server.js`, `server/lib/security.js`, `server/lib/payment-endpoints.js`, `public/js/chat.js`, `public/js/lobby.js`, `public/js/connect.js`, and `public/js/notification-system.js`.

## User Input Sources

| Source | Current handling |
| --- | --- |
| Login username | `validateUsername()` restricts to 3-20 letters, numbers, `_`, `-`; SQL uses placeholders. |
| Login password | Accepted for legacy accounts if non-empty and <= 128 chars; SQL uses placeholders. |
| Registration password | Requires 8-128 chars, at least one letter and one number. |
| Email | Trimmed/lowercased on registration, max 254 chars, format checked before storage. |
| Guest username | Normalized to username-safe characters or replaced with generated `Guest_xxxxxx`. |
| Game name | Decoded, trimmed, validated by `validateGameName()`, and rendered escaped in lobby. |
| Chat | Server normalizes controls/length and rate-limits; client renders messages with `textContent`. |
| Notifications/combat reports | Plain notification slots are HTML-escaped; combat report labels and summary lines are escaped before rich modal rendering. |
| WebSocket commands | Oversized frames are rejected; command-specific handlers parse numeric ids before using dynamic table names. |
| Payment body `userId` | Non-webhook payment endpoints require body/path `userId` to match authenticated cookies. |

## HTTP API Authorization

User-scoped JSON APIs require:

- `userId` cookie exists and matches the path/body user id.
- `tempKey` cookie exists and matches `users.tempkey` with timing-safe comparison.

Game-scoped JSON APIs require:

- valid `userId`/`tempKey` cookies.
- a row for the authenticated user in `playersN`.

Unauthenticated calls return `401`; authenticated calls for another user or game return `403`.

## Rendering Rules

- Prefer `textContent` for user-originated strings.
- Only use `innerHTML` for local templates or after explicit escaping of every dynamic value.
- Lobby player and game names are escaped before template insertion.
- Chat no longer stores or restores HTML in history.
- Notification titles/messages are escaped before insertion; rich modal bodies must escape every dynamic value before calling `NotificationSystem.modal()`.

## Residual Risks

- `tempKey` is a bearer credential readable by JavaScript because the WebSocket bootstrap currently needs it. A future signed, HTTP-only session cookie would be stronger.
- The project still has many template-based UI renderers. They are acceptable for constant data and escaped server data, but new user-originated strings should not be added to them without a test.
- Per-game SQL table names cannot use placeholders; keep all game ids parsed as positive integers before building `playersN`, `mapN`, etc.
