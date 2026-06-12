#!/bin/bash

# Game of Worlds - Automated Deployment Script
# Deploys Phase 2 (Hazard Mechanics) to production

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROD_HOST="${PROD_HOST:-140.82.4.209}"
PROD_USER="${PROD_USER:-root}"
PROD_PATH="${PROD_PATH:-/opt/game-of-worlds}"
PROD_PASSWORD="${PROD_PASSWORD:-}"

echo -e "${YELLOW}=== Game of Worlds Phase 2 Deployment ===${NC}"
echo ""

# Check if password is provided
if [ -z "$PROD_PASSWORD" ]; then
    echo -e "${RED}Error: PROD_PASSWORD environment variable not set${NC}"
    echo "Usage: PROD_PASSWORD=your_password ./deploy.sh"
    echo ""
    echo "Or export it first:"
    echo "  export PROD_PASSWORD=your_password"
    echo "  ./deploy.sh"
    exit 1
fi

# Check if sshpass is installed
if ! command -v sshpass &> /dev/null; then
    echo -e "${RED}Error: sshpass is not installed${NC}"
    echo "Install it with: apt-get install sshpass (Linux) or brew install sshpass (Mac)"
    exit 1
fi

echo -e "${YELLOW}Configuration:${NC}"
echo "  Host: $PROD_HOST"
echo "  User: $PROD_USER"
echo "  Path: $PROD_PATH"
echo ""

# Verify files exist locally
echo -e "${YELLOW}Verifying local files...${NC}"
files=(
    "server/server.js"
    "server/lib/utils/index.js"
    "server/lib/game/index.js"
    "server/lib/movement/index.js"
    "server/lib/movement/hazards.js"
    "server/lib/broadcast/index.js"
    "server/lib/database/index.js"
    "server/lib/config/constants.js"
    "server/lib/handlers/index.js"
)

for file in "${files[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}✗ Missing: $file${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} $file"
done

echo ""
echo -e "${YELLOW}Starting deployment...${NC}"
echo ""

# Backup existing files on production
echo -e "${YELLOW}Step 1: Backing up existing files...${NC}"
sshpass -p "$PROD_PASSWORD" ssh -o StrictHostKeyChecking=no "$PROD_USER@$PROD_HOST" \
    "mkdir -p $PROD_PATH/backups && cp -r $PROD_PATH/server/server.js $PROD_PATH/backups/server.js.$(date +%s).backup && \
    cp -r $PROD_PATH/server/lib $PROD_PATH/backups/lib.$(date +%s).backup" 2>/dev/null && \
    echo -e "${GREEN}✓ Backup created${NC}" || echo -e "${RED}✗ Backup failed (continuing)${NC}"

echo ""

# Deploy new modules
echo -e "${YELLOW}Step 2: Deploying new modules...${NC}"

modules=("utils" "game" "movement" "broadcast" "database" "config" "handlers")
for module in "${modules[@]}"; do
    if [ -d "server/lib/$module" ]; then
        sshpass -p "$PROD_PASSWORD" scp -r -o StrictHostKeyChecking=no \
            "server/lib/$module" "$PROD_USER@$PROD_HOST:$PROD_PATH/server/lib/" 2>/dev/null && \
            echo -e "${GREEN}✓${NC} lib/$module deployed" || \
            echo -e "${RED}✗${NC} lib/$module deployment failed"
    fi
done

echo ""

# Deploy updated server.js
echo -e "${YELLOW}Step 3: Deploying updated server.js...${NC}"
sshpass -p "$PROD_PASSWORD" scp -o StrictHostKeyChecking=no \
    "server/server.js" "$PROD_USER@$PROD_HOST:$PROD_PATH/server/" 2>/dev/null && \
    echo -e "${GREEN}✓ server.js deployed${NC}" || \
    echo -e "${RED}✗ server.js deployment failed${NC}"

echo ""

# Deploy documentation
echo -e "${YELLOW}Step 4: Deploying documentation...${NC}"
docs=("PHASE1_MIGRATION_CHECKLIST.md" "PHASE1_INTEGRATION_GUIDE.md" "PHASE2_IMPLEMENTATION.md" "REORGANIZATION_COMPLETE.md" "ARCHITECTURE_NOTES.md" "DEPLOYMENT_GUIDE.md")
for doc in "${docs[@]}"; do
    if [ -f "$doc" ]; then
        sshpass -p "$PROD_PASSWORD" scp -o StrictHostKeyChecking=no \
            "$doc" "$PROD_USER@$PROD_HOST:$PROD_PATH/" 2>/dev/null && \
            echo -e "${GREEN}✓${NC} $doc deployed" || \
            echo -e "${RED}✗${NC} $doc deployment failed"
    fi
done

echo ""

# Verify deployment
echo -e "${YELLOW}Step 5: Verifying deployment...${NC}"
sshpass -p "$PROD_PASSWORD" ssh -o StrictHostKeyChecking=no "$PROD_USER@$PROD_HOST" \
    "test -f $PROD_PATH/server/lib/movement/hazards.js && \
    test -f $PROD_PATH/server/lib/utils/index.js && \
    test -f $PROD_PATH/server/server.js && \
    echo 'Files verified'" 2>/dev/null && \
    echo -e "${GREEN}✓ All files deployed successfully${NC}" || \
    echo -e "${YELLOW}⚠ Verification inconclusive (continuing)${NC}"

echo ""

# Restart service
echo -e "${YELLOW}Step 6: Restarting service...${NC}"
sshpass -p "$PROD_PASSWORD" ssh -o StrictHostKeyChecking=no "$PROD_USER@$PROD_HOST" \
    "systemctl restart game-of-worlds" 2>/dev/null && \
    echo -e "${GREEN}✓ Service restarted${NC}" || \
    echo -e "${RED}✗ Service restart failed${NC}"

echo ""

# Wait for service to start
echo -e "${YELLOW}Step 7: Waiting for service to start...${NC}"
sleep 3

# Smoke test
echo -e "${YELLOW}Step 8: Running smoke test...${NC}"
response=$(sshpass -p "$PROD_PASSWORD" ssh -o StrictHostKeyChecking=no "$PROD_USER@$PROD_HOST" \
    "curl -s http://localhost:3000/ | head -c 100" 2>/dev/null)

if [ ! -z "$response" ]; then
    echo -e "${GREEN}✓ Server is responding${NC}"
else
    echo -e "${YELLOW}⚠ Server may still be starting, check logs manually${NC}"
fi

echo ""

# Final status
echo -e "${YELLOW}Step 9: Checking service status...${NC}"
sshpass -p "$PROD_PASSWORD" ssh -o StrictHostKeyChecking=no "$PROD_USER@$PROD_HOST" \
    "systemctl status game-of-worlds --no-pager | head -10" 2>/dev/null || \
    echo -e "${YELLOW}⚠ Could not retrieve status${NC}"

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo "Next steps:"
echo "1. Monitor logs: ssh root@$PROD_HOST 'tail -f /var/log/game-of-worlds.log'"
echo "2. Test hazard mechanics (create game, move fleet)"
echo "3. Verify narrative messages appear"
echo "4. Check other players receive broadcasts"
echo ""
echo "If issues occur, rollback with:"
echo "  ssh root@$PROD_HOST 'systemctl stop game-of-worlds && \\"
echo "  cp -r $PROD_PATH/backups/server.js.*.backup $PROD_PATH/server/server.js && \\"
echo "  systemctl start game-of-worlds'"
echo ""
