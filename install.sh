#!/usr/bin/env bash
set -euo pipefail

# Installs commitblog into the current git repository.

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git is required."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required."
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: run this inside a git repository."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"
COMMITBLOG_DIR="$REPO_ROOT/.commitblog"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

mkdir -p "$COMMITBLOG_DIR"

cp "$SCRIPT_DIR/generate.ts" "$COMMITBLOG_DIR/generate.ts"
cp "$SCRIPT_DIR/package.json" "$COMMITBLOG_DIR/package.json"
HOOK_FILE="$HOOKS_DIR/post-commit"

if [ -f "$HOOK_FILE" ]; then
  if ! grep -Fq ".commitblog/generate.ts" "$HOOK_FILE"; then
    cat >>"$HOOK_FILE" <<'EOF'

# commitblog
CB_DIR="$(git rev-parse --show-toplevel)/.commitblog"
if [ -f "$CB_DIR/generate.ts" ] \
  && [ -z "$COMMITBLOG_SKIP" ] \
  && [ ! -d "$(git rev-parse --git-dir)/rebase-merge" ] \
  && [ ! -d "$(git rev-parse --git-dir)/rebase-apply" ]; then
  cd "$(git rev-parse --show-toplevel)"
  npx tsx "$CB_DIR/generate.ts" &
fi
EOF
  fi
else
  cp "$SCRIPT_DIR/post-commit" "$HOOK_FILE"
fi

chmod +x "$HOOK_FILE"

if [ ! -f "$REPO_ROOT/.commitblog.json" ]; then
  cat >"$REPO_ROOT/.commitblog.json" <<'EOF'
{
  "model": "anthropic/claude-sonnet-4-20250514",
  "outputDir": "blogs",
  "skipPatterns": ["^Merge ", "^WIP", "^fixup!", "^chore:"]
}
EOF
fi

(
  cd "$COMMITBLOG_DIR"
  npm install
)

if [ ! -f "$REPO_ROOT/.env" ]; then
  cat >"$REPO_ROOT/.env" <<'EOF'
# Add the key for the provider used by your selected model.
ANTHROPIC_API_KEY=
# OPENAI_API_KEY=
# GOOGLE_GENERATIVE_AI_API_KEY=
# GROQ_API_KEY=
# OPENROUTER_API_KEY=
EOF
fi

GITIGNORE_FILE="$REPO_ROOT/.gitignore"
[ -f "$GITIGNORE_FILE" ] || touch "$GITIGNORE_FILE"

for entry in "blogs/" ".commitblog.json"; do
  if ! grep -Fxq "$entry" "$GITIGNORE_FILE"; then
    printf "%s\n" "$entry" >>"$GITIGNORE_FILE"
  fi
done

echo "commitblog installed."
echo "- Hook: .git/hooks/post-commit"
echo "- Script: .commitblog/generate.ts"
echo "- Config: .commitblog.json"
echo "- Environment: .env"
