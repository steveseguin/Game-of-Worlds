# Claude Code Project Guide

## IMPORTANT: Deployment Workflow

**ALWAYS deploy and test on production after code changes. The user does NOT test locally.**

After making any code changes:
1. Copy changed files to production via SCP
2. Restart the service: `systemctl restart game-of-worlds`
3. Verify server is running: `systemctl status game-of-worlds`
4. Run smoke test to confirm server responds

## Secrets & Deployment

Production server credentials are stored in:
```
secrets/readme/claude/agents/ssh
```

## Production Server

- Host: 140.82.4.209
- User: root
- App path: `/opt/game-of-worlds/`
- Service: `systemctl restart game-of-worlds`

### Deploy Commands

```bash
# Copy a file to production
sshpass -p 'PASSWORD' scp -o StrictHostKeyChecking=no LOCAL_FILE root@140.82.4.209:/opt/game-of-worlds/PATH

# Restart server
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no root@140.82.4.209 "systemctl restart game-of-worlds"

# Check status
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no root@140.82.4.209 "systemctl status game-of-worlds"

# Smoke test
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no root@140.82.4.209 "curl -s localhost:3000/ | head -c 100"
```

## Project Structure

- `server/` - Node.js backend (Express + WebSocket)
- `server/lib/` - Server libraries (ai.js, victory.js, payments.js, etc.)
- `public/` - Frontend static files
- `tests/` - Test files

## Key Files

- `server/server.js` - Main WebSocket game logic
- `server/lib/victory.js` - Victory conditions and game cleanup
- `server/index.js` - Server entry point
