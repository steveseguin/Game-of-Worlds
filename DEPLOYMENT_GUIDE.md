# Production Deployment Guide

## Overview
This guide covers deploying Phase 2 (Hazard Mechanics) to the production server at 140.82.4.209.

## Pre-Deployment Checklist

- [x] All syntax validated
- [x] All modules tested locally
- [x] Documentation complete
- [x] No breaking changes to existing API
- [x] Backward compatible

## Files to Deploy

### New Files (Create)
```
server/lib/utils/index.js
server/lib/game/index.js
server/lib/movement/index.js
server/lib/movement/hazards.js
server/lib/broadcast/index.js
server/lib/database/index.js
server/lib/config/constants.js
server/lib/handlers/index.js
```

### Modified Files (Replace)
```
server/server.js
```

### Documentation Files (Deploy)
```
PHASE1_MIGRATION_CHECKLIST.md
PHASE1_INTEGRATION_GUIDE.md
PHASE2_IMPLEMENTATION.md
REORGANIZATION_COMPLETE.md
ARCHITECTURE_NOTES.md
```

## Deployment Methods

### Option 1: Manual SSH Deployment

```bash
# Set credentials
PROD_HOST="140.82.4.209"
PROD_USER="root"
PROD_PASSWORD="[PASSWORD_FROM_SECRETS]"
PROD_PATH="/opt/game-of-worlds"

# Copy new modules
sshpass -p '$PROD_PASSWORD' scp -r server/lib/utils/ $PROD_USER@$PROD_HOST:$PROD_PATH/server/lib/
sshpass -p '$PROD_PASSWORD' scp -r server/lib/game/ $PROD_USER@$PROD_HOST:$PROD_PATH/server/lib/
sshpass -p '$PROD_PASSWORD' scp -r server/lib/movement/ $PROD_USER@$PROD_HOST:$PROD_PATH/server/lib/
sshpass -p '$PROD_PASSWORD' scp -r server/lib/broadcast/ $PROD_USER@$PROD_HOST:$PROD_PATH/server/lib/
sshpass -p '$PROD_PASSWORD' scp -r server/lib/database/ $PROD_USER@$PROD_HOST:$PROD_PATH/server/lib/
sshpass -p '$PROD_PASSWORD' scp -r server/lib/config/ $PROD_USER@$PROD_HOST:$PROD_PATH/server/lib/
sshpass -p '$PROD_PASSWORD' scp -r server/lib/handlers/ $PROD_USER@$PROD_HOST:$PROD_PATH/server/lib/

# Copy updated server.js
sshpass -p '$PROD_PASSWORD' scp server/server.js $PROD_USER@$PROD_HOST:$PROD_PATH/server/

# Copy documentation
sshpass -p '$PROD_PASSWORD' scp PHASE*.md $PROD_USER@$PROD_HOST:$PROD_PATH/
sshpass -p '$PROD_PASSWORD' scp REORGANIZATION_COMPLETE.md $PROD_USER@$PROD_HOST:$PROD_PATH/
```

### Option 2: Automated Deployment Script

Run the provided `deploy.sh` script:

```bash
bash deploy.sh
```

### Option 3: Git Push (if repository is connected)

```bash
git add .
git commit -m "Deploy Phase 2: Hazard mechanics implementation"
git push origin main
# Then pull on production server and restart
```

## Restart Service

After files are deployed:

```bash
# SSH into production
ssh root@140.82.4.209

# Restart the service
systemctl restart game-of-worlds

# Verify status
systemctl status game-of-worlds

# Check logs
journalctl -u game-of-worlds -n 50
```

## Post-Deployment Verification

### 1. Server Health Check
```bash
curl -s http://localhost:3000/ | head -c 100
```

### 2. Database Connection
```bash
# Connect to game and check if database works
curl -X POST http://localhost:3000/api/login -d '{"username":"test","password":"test"}'
```

### 3. Hazard Testing
1. Create a new game
2. Move fleet to adjacent sector
3. Verify hazard detection works
4. Check narrative messages are displayed

### 4. Log Monitoring
```bash
# Watch for errors
tail -f /var/log/game-of-worlds.log | grep -i error
```

## Rollback Plan

If deployment causes issues:

### Quick Rollback
```bash
# Restore from backup
cp /opt/game-of-worlds/server/server.js.backup /opt/game-of-worlds/server/server.js
rm -rf /opt/game-of-worlds/server/lib/{utils,game,movement,broadcast,database,config,handlers}
systemctl restart game-of-worlds
```

### Full Rollback
```bash
# Use git to revert
cd /opt/game-of-worlds
git revert HEAD
git push
systemctl restart game-of-worlds
```

## Deployment Checklist

- [ ] Backup current server.js
- [ ] Backup current lib/ directory
- [ ] Copy new modules to server
- [ ] Copy updated server.js
- [ ] Verify file permissions (755 for scripts, 644 for data)
- [ ] Verify database connectivity
- [ ] Restart service
- [ ] Run smoke test (create game, move fleet)
- [ ] Monitor logs for 30 minutes
- [ ] Verify hazard mechanics work
- [ ] Confirm narrative messages appear
- [ ] Check player broadcasting works

## Testing Scenarios

### Test 1: Black Hole Destruction
1. Create new game
2. Move fleet to black hole sector (sectortype 2)
3. Expected: Fleet completely destroyed, dramatic message displayed
4. Verify: Other players see notification

### Test 2: Asteroid Belt Damage
1. Move fleet to asteroid belt (sectortype 1)
2. Expected: ~50% of ships destroyed (random)
3. Message: "We lost X ships..." or "Lucky escape"
4. Move again to same sector
5. Expected: No damage (now owned)

### Test 3: Probe Destruction
1. Send probe to black hole sector
2. Expected: Probe destroyed, sector not revealed
3. Send probe to safe sector
4. Expected: Sector revealed with data

### Test 4: Auto-Colonization
1. Move fleet to unowned planet
2. Expected: Sector ownership transfers
3. Verify: Sector shows player's color on map

## Performance Monitoring

After deployment, monitor:

```bash
# CPU usage
top -b -n 1 | grep node

# Memory usage
free -h

# Database connections
mysql -u game -p -e "SHOW PROCESSLIST;"

# Game state
curl http://localhost:3000/api/game-state
```

## Success Criteria

Deployment is successful when:
- ✅ Server starts without errors
- ✅ All new modules load correctly
- ✅ Database connections work
- ✅ Black hole mechanic works (fleet destroyed)
- ✅ Asteroid belt mechanic works (random damage)
- ✅ Probe destruction works (probe lost)
- ✅ Auto-colonization works (planet taken)
- ✅ Narrative messages display correctly
- ✅ Broadcasting reaches other players
- ✅ No performance degradation
- ✅ Logs show no errors for 30+ minutes

## Support

If issues arise:
1. Check `/var/log/game-of-worlds.log` for errors
2. Verify all files copied correctly
3. Check database connectivity
4. Review module initialization order
5. Rollback if necessary and contact development

## Estimated Downtime

- Deployment time: 5 minutes
- Service restart: < 1 minute
- Testing: 5-10 minutes
- Total: 15 minutes

Plan deployment during low-traffic hours.
