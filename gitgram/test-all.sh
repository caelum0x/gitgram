#!/bin/bash

echo "🧪 Gitgram Complete Test Suite"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

test_endpoint() {
    local name=$1
    local url=$2
    local expected=$3
    
    echo -n "Testing $name... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    
    if [ "$response" = "$expected" ]; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL (got $response, expected $expected)${NC}"
        ((FAILED++))
    fi
}

echo -e "${BLUE}1. Backend Health Check${NC}"
echo "----------------------"
test_endpoint "Health endpoint" "http://localhost:3001/health" "200"
echo ""

echo -e "${BLUE}2. Repository Endpoints${NC}"
echo "---------------------"
test_endpoint "Search repos" "http://localhost:3001/api/repositories/search?q=vscode" "200"
test_endpoint "Get repo" "http://localhost:3001/api/repositories/microsoft/vscode" "200"
test_endpoint "Trending repos" "http://localhost:3001/api/repositories/trending" "200"
echo ""

echo -e "${BLUE}3. Core API Endpoints${NC}"
echo "-------------------"
test_endpoint "Posts endpoint" "http://localhost:3001/api/posts" "401"
test_endpoint "Users endpoint" "http://localhost:3001/api/users" "200"
echo ""

echo -e "${BLUE}4. Frontend Pages${NC}"
echo "---------------"
test_endpoint "Home page" "http://localhost:3002" "200"
test_endpoint "Explore repos" "http://localhost:3002/explore/repos" "200"
echo ""

echo ""
echo "=============================="
echo -e "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
echo "=============================="
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some tests failed${NC}"
    exit 1
fi
