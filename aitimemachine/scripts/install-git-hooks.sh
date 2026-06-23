#!/bin/bash
# AITimeMachine Git Hooks Installer

HOOKS_DIR=".git/hooks"

if [ ! -d "$HOOKS_DIR" ]; then
  echo "Not a git repository"
  exit 1
fi

# Pre-commit hook - capture before commit
cat > "$HOOKS_DIR/pre-commit" << 'EOF'
#!/bin/bash
# AITimeMachine: Capture state before commit
if command -v aitm &> /dev/null; then
  aitm checkpoint "Pre-commit: $(git log -1 --format=%s 2>/dev/null || echo 'new commit')" 2>/dev/null &
fi
EOF
chmod +x "$HOOKS_DIR/pre-commit"

# Post-commit hook - log the commit
cat > "$HOOKS_DIR/post-commit" << 'EOF'
#!/bin/bash
# AITimeMachine: Log commit
if command -v aitm &> /dev/null; then
  MSG=$(git log -1 --format=%s)
  aitm log system "Git commit: $MSG" 2>/dev/null &
fi
EOF
chmod +x "$HOOKS_DIR/post-commit"

# Post-checkout hook - capture after branch switch
cat > "$HOOKS_DIR/post-checkout" << 'EOF'
#!/bin/bash
# AITimeMachine: Capture after checkout
if command -v aitm &> /dev/null; then
  BRANCH=$(git branch --show-current)
  aitm checkpoint "Checkout: $BRANCH" 2>/dev/null &
fi
EOF
chmod +x "$HOOKS_DIR/post-checkout"

echo "[OK] AITimeMachine git hooks installed"
echo "  - pre-commit: Captures state before commits"
echo "  - post-commit: Logs commit messages"
echo "  - post-checkout: Captures after branch switches"
