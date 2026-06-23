#!/bin/bash

# Gitgram - Remove Package from Project
# Usage: ./scripts/remove-package.sh [backend|mobile|web|all] <package-name>

set -e

if [ $# -lt 2 ]; then
    echo "Usage: $0 [backend|mobile|web|all] <package-name>"
    echo ""
    echo "Examples:"
    echo "  $0 backend express"
    echo "  $0 mobile react-native-vector-icons"
    echo "  $0 web next-auth"
    echo "  $0 all axios"
    exit 1
fi

PROJECT=$1
PACKAGE=$2

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

case $PROJECT in
    backend)
        echo -e "${BLUE}🗑️  Removing $PACKAGE from backend...${NC}"
        cd backend
        npm uninstall $PACKAGE
        cd ..
        echo -e "${GREEN}✅ Package removed from backend${NC}"
        ;;
    mobile)
        echo -e "${BLUE}🗑️  Removing $PACKAGE from mobile...${NC}"
        cd mobile
        npm uninstall $PACKAGE
        cd ..
        echo -e "${GREEN}✅ Package removed from mobile${NC}"
        ;;
    web)
        echo -e "${BLUE}🗑️  Removing $PACKAGE from web...${NC}"
        cd web
        npm uninstall $PACKAGE
        cd ..
        echo -e "${GREEN}✅ Package removed from web${NC}"
        ;;
    all)
        echo -e "${BLUE}🗑️  Removing $PACKAGE from all projects...${NC}"
        cd backend && npm uninstall $PACKAGE && cd ..
        cd mobile && npm uninstall $PACKAGE && cd ..
        cd web && npm uninstall $PACKAGE && cd ..
        echo -e "${GREEN}✅ Package removed from all projects${NC}"
        ;;
    *)
        echo -e "${RED}❌ Invalid project: $PROJECT${NC}"
        echo "Valid options: backend, mobile, web, all"
        exit 1
        ;;
esac

