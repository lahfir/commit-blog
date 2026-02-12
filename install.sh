#!/bin/bash
# Install commitblog into the current git repo
set -e

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  echo "Error: not inside a git repo."
  exit 1
fi

echo ""
echo "  commitblog installer"
echo "  ────────────────────"
echo ""

# Create .commitblog directory
mkdir -p "$REPO_ROOT/.commitblog"
mkdir -p "$REPO_ROOT/blogs"

# Copy generate.ts (or download it)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/generate.ts" ]; then
  cp "$SCRIPT_DIR/generate.ts" "$REPO_ROOT/.commitblog/generate.ts"
else
  echo "Error: generate.ts not found. Place this script next to generate.ts."
  exit 1
fi

# Create default config
if [ ! -f "$REPO_ROOT/.commitblog.json" ]; then
  cat > "$REPO_ROOT/.commitblog.json" << 'EOF'
{
  "model": "anthropic/claude-sonnet-4-20250514",
  "outputDir": "blogs",
  "skipPatterns": ["^Merge ", "^WIP", "^fixup!", "^chore:"]
}
EOF
  echo "  Created .commitblog.json"
fi

# Install package.json deps in .commitblog
cat > "$REPO_ROOT/.commitblog/package.json" << 'EOF'
{
  "name": "commitblog-local",
  "type": "module",
  "dependencies": {
    "ai": "^4.3.0",
    "@ai-sdk/anthropic": "^1.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "@ai-sdk/google": "^1.0.0"
  }
}
EOF

echo "  Installing dependencies..."
cd "$REPO_ROOT/.commitblog" && npm install --silent 2>/dev/null
cd "$REPO_ROOT"

# Install git hook
mkdir -p "$REPO_ROOT/.git/hooks"
HOOK_FILE="$REPO_ROOT/.git/hooks/post-commit"

if [ -f "$HOOK_FILE" ]; then
  if grep -q "commitblog" "$HOOK_FILE"; then
    echo "  Git hook already installed."
  else
    echo "" >> "$HOOK_FILE"
    echo "# commitblog" >> "$HOOK_FILE"
    echo 'npx tsx "$(git rev-parse --show-toplevel)/.commitblog/generate.ts" &' >> "$HOOK_FILE"
    echo "  Appended to existing post-commit hook."
  fi
else
  cat > "$HOOK_FILE" << 'HOOK'
#!/bin/sh
CB_DIR="$(git rev-parse --show-toplevel)/.commitblog"
[ ! -f "$CB_DIR/generate.ts" ] && exit 0
[ -d "$(git rev-parse --git-dir)/rebase-merge" ] && exit 0
[ -n "$COMMITBLOG_SKIP" ] && exit 0
cd "$(git rev-parse --show-toplevel)"
npx tsx "$CB_DIR/generate.ts" &
exit 0
HOOK
  chmod +x "$HOOK_FILE"
  echo "  Installed post-commit hook."
fi

# Add to .gitignore
if ! grep -q ".commitblog/node_modules" "$REPO_ROOT/.gitignore" 2>/dev/null; then
  echo ".commitblog/node_modules" >> "$REPO_ROOT/.gitignore"
fi

echo ""
echo "  Done. Set your API key:"
echo ""
echo "    export ANTHROPIC_API_KEY=sk-..."
echo ""
echo "  Or switch providers in .commitblog.json:"
echo ""
echo '    { "model": "openai/gpt-4o" }'
echo '    { "model": "google/gemini-2.0-flash" }'
echo '    { "model": "anthropic/claude-sonnet-4-20250514" }'
echo ""
echo "  Skip a commit:  COMMITBLOG_SKIP=1 git commit -m '...'"
echo ""
