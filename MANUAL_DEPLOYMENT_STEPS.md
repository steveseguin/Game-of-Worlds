# Manual Deployment Steps - Game of Worlds Phase 2

Execute these commands on your production server or via SSH.

## Prerequisites

```bash
# Your SSH credentials for root@140.82.4.209
PROD_HOST="140.82.4.209"
PROD_USER="root"
PROD_PATH="/opt/game-of-worlds"
```

## Step 1: Connect to Production Server

```bash
ssh root@140.82.4.209
# Enter password when prompted
```

## Step 2: Backup Current Files

```bash
# Create backup directory
mkdir -p /opt/game-of-worlds/backups

# Backup existing files
cp -r /opt/game-of-worlds/server/server.js /opt/game-of-worlds/backups/server.js.$(date +%s).backup
cp -r /opt/game-of-worlds/server/lib /opt/game-of-worlds/backups/lib.$(date +%s).backup

echo "Backups created successfully"
```

## Step 3: Stop the Service

```bash
systemctl stop game-of-worlds
sleep 2
systemctl status game-of-worlds
```

## Step 4: Deploy New Files (Local Machine)

From your local machine, copy files to production:

```bash
# Set your SSH password
export SSH_PASSWORD="[your_password]"

# Copy new modules
scp -r server/lib/utils root@140.82.4.209:/opt/game-of-worlds/server/lib/
scp -r server/lib/game root@140.82.4.209:/opt/game-of-worlds/server/lib/
scp -r server/lib/movement root@140.82.4.209:/opt/game-of-worlds/server/lib/
scp -r server/lib/broadcast root@140.82.4.209:/opt/game-of-worlds/server/lib/
scp -r server/lib/database root@140.82.4.209:/opt/game-of-worlds/server/lib/
scp -r server/lib/config root@140.82.4.209:/opt/game-of-worlds/server/lib/
scp -r server/lib/handlers root@140.82.4.209:/opt/game-of-worlds/server/lib/

# Copy updated server.js
scp server/server.js root@140.82.4.209:/opt/game-of-worlds/server/

# Copy documentation
scp PHASE*.md REORGANIZATION_COMPLETE.md DEPLOYMENT_GUIDE.md root@140.82.4.209:/opt/game-of-worlds/

echo "Files copied successfully"
```

## Step 5: Verify File Permissions (On Production)

```bash
cd /opt/game-of-worlds

# Check files exist
ls -la server/lib/movement/hazards.js
ls -la server/lib/utils/index.js
ls -la server/server.js

# Fix permissions if needed
chmod 644 server/server.js
chmod 755 server/lib/*/
chmod 644 server/lib/*/*.js
chmod 644 server/lib/*/*/*.js

echo "File permissions verified"
```

## Step 6: Validate Syntax (On Production)

```bash
cd /opt/game-of-worlds

# Check for syntax errors
node -c server/server.js && echo "✓ server.js syntax valid" || echo "✗ Syntax error in server.js"
node -c server/lib/movement/hazards.js && echo "✓ hazards.js syntax valid" || echo "✗ Syntax error"

# If syntax errors found, rollback immediately:
# cp -r backups/server.js.*.backup server/server.js
# cp -r backups/lib.*.backup server/lib
```

## Step 7: Restart Service (On Production)

```bash
# Start the service
systemctl start game-of-worlds

# Wait for startup
sleep 3

# Check status
systemctl status game-of-worlds

# If service fails to start, rollback:
# systemctl stop game-of-worlds
# cp -r backups/server.js.*.backup server/server.js
# cp -r backups/lib.*.backup server/lib
# systemctl start game-of-worlds
```

## Step 8: Verify Service is Running

```bash
# Check if service is active
systemctl is-active game-of-worlds

# Check if port 3000 is listening
netstat -tlnp | grep 3000

# Quick curl test
curl -s http://localhost:3000/ | head -c 100
```

## Step 9: Monitor Logs

```bash
# Watch logs in real-time
tail -f /var/log/game-of-worlds.log

# Look for errors
grep -i error /var/log/game-of-worlds.log | tail -20

# Let it run for at least 30 minutes without errors
```

## Step 10: Test Hazard Mechanics

In-game testing:
1. Create a new game
2. Move fleet to a sector with type 1 (asteroid belt) - should take ~50% damage
3. Move fleet to a different asteroid belt sector - should see no damage (if you own it)
4. Send probe to black hole - should say probe destroyed
5. Move fleet to unowned planet - should auto-colonize
6. Verify narrative messages appear
7. Check that other players see broadcast notifications

## Rollback (If Needed)

```bash
# Stop service
systemctl stop game-of-worlds

# Restore from backup
cp -r /opt/game-of-worlds/backups/server.js.*.backup /opt/game-of-worlds/server/server.js
cp -r /opt/game-of-worlds/backups/lib.*.backup /opt/game-of-worlds/server/lib

# Restart
systemctl start game-of-worlds

# Verify
systemctl status game-of-worlds
```

## Troubleshooting

### Service won't start
```bash
# Check syntax
node -c /opt/game-of-worlds/server/server.js

# Check logs
journalctl -u game-of-worlds -n 50

# Verify all files copied correctly
ls -la /opt/game-of-worlds/server/lib/movement/hazards.js
```

### Module import errors
```bash
# Make sure all new modules exist
ls -la /opt/game-of-worlds/server/lib/utils/index.js
ls -la /opt/game-of-worlds/server/lib/game/index.js
ls -la /opt/game-of-worlds/server/lib/broadcast/index.js
ls -la /opt/game-of-worlds/server/lib/database/index.js
ls -la /opt/game-of-worlds/server/lib/config/constants.js
ls -la /opt/game-of-worlds/server/lib/handlers/index.js

# Check permissions
chmod 755 /opt/game-of-worlds/server/lib/*/
chmod 644 /opt/game-of-worlds/server/lib/*/*.js
```

### Database connection issues
```bash
# Test database
mysql -u game -p -h localhost -e "SELECT COUNT(*) FROM users;" game

# Check if database exists
mysql -u root -p -e "SHOW DATABASES LIKE 'game';"
```

## Success Criteria

After deployment, verify:
- ✓ Service starts without errors
- ✓ Logs show no errors for 30+ minutes
- ✓ Can create a game
- ✓ Can move fleet
- ✓ Black hole mechanics work (fleet destroyed)
- ✓ Asteroid belt mechanics work (50% damage)
- ✓ Probe destruction works
- ✓ Auto-colonization works
- ✓ Narrative messages appear
- ✓ Other players receive broadcasts

## Support

For issues:
1. Check `/var/log/game-of-worlds.log` for errors
2. Run `node -c /opt/game-of-worlds/server/server.js` to check syntax
3. Verify all new files were copied correctly
4. Use rollback procedure if deployment fails
5. Contact development team for unresolved issues

---

**Deployment Duration**: ~15 minutes including testing
**Rollback Time**: ~5 minutes
**Confidence Level**: HIGH (90%+)
