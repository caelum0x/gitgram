#!/bin/bash

# Gitgram - Add Package to Project
# Usage: ./scripts/add-package.sh [backend|mobile|web] <package-name> [--dev]

set -e

if [ $# -lt 2 ]; then
    echo "Usage: $0 [backend|mobile|web|all] <package-name> [--dev]"
    echo ""
    echo "Examples:"
    echo "  $0 backend express"
    echo "  $0 mobile react-native-vector-icons"
    echo "  $0 web next-auth"
    echo "  $0 all axios --dev"
    exit 1
fi

PROJECT=$1
PACKAGE=$2
DEV_FLAG=${3:-""}

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

case $PROJECT in
    backend)
        echo -e "${BLUE}📦 Adding $PACKAGE to backend...${NC}"
        cd backend
        npm install --legacy-peer-deps $DEV_FLAG $PACKAGE
        cd ..
        echo -e "${GREEN}✅ Package added to backend${NC}"
        ;;
    mobile)
        echo -e "${BLUE}📦 Adding $PACKAGE to mobile...${NC}"
        cd mobile
        npm install --legacy-peer-deps $DEV_FLAG $PACKAGE
        cd ..
        echo -e "${GREEN}✅ Package added to mobile${NC}"
        ;;
    web)
        echo -e "${BLUE}📦 Adding $PACKAGE to web...${NC}"
        cd web
        npm install --legacy-peer-deps $DEV_FLAG $PACKAGE
        cd ..
        echo -e "${GREEN}✅ Package added to web${NC}"
        ;;
    all)
        echo -e "${BLUE}📦 Adding $PACKAGE to all projects...${NC}"
        cd backend && npm install --legacy-peer-deps $DEV_FLAG $PACKAGE && cd ..
        cd mobile && npm install --legacy-peer-deps $DEV_FLAG $PACKAGE && cd ..
        cd web && npm install --legacy-peer-deps $DEV_FLAG $PACKAGE && cd ..
        echo -e "${GREEN}✅ Package added to all projects${NC}"
        ;;
    *)
        echo -e "${RED}❌ Invalid project: $PROJECT${NC}"
        echo "Valid options: backend, mobile, web, all"
        exit 1
        ;;
esac

