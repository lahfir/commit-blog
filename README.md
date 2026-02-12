# commitblog

Turn every git commit into a technical blog post. Stripe/Vercel/Netflix quality, zero effort.

## How it works

```
git commit → post-commit hook → reads diff + message → LLM → blogs/2025-02-10-your-slug.md
```

That's it. One file (`generate.ts`), one git hook, one config.

## Install

```bash
# In your repo
git clone https://github.com/yourname/commitblog /tmp/commitblog
bash /tmp/commitblog/install.sh

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...
```

## Switch providers

Edit `.commitblog.json`:

```json
{ "model": "anthropic/claude-sonnet-4-20250514" }
{ "model": "openai/gpt-4o" }
{ "model": "google/gemini-2.0-flash" }
```

Uses the [Vercel AI SDK](https://ai-sdk.dev) — any supported provider works.

## Skip a commit

```bash
COMMITBLOG_SKIP=1 git commit -m "wip stuff"
```

Merge commits, WIP, fixup, and chore commits are skipped automatically.

## What you get

A markdown file in `blogs/` with:

- YAML frontmatter (title, date, author, tags, description)
- Real code from your diff, not pseudocode
- Mermaid diagrams when architecture changes warrant them
- SEO-optimized title and tags derived from actual technologies in the diff
- Written in first person, engineer-to-engineer tone — no AI slop

## Config

`.commitblog.json` at your repo root:

| Field          | Default                              | Description                    |
| -------------- | ------------------------------------ | ------------------------------ |
| `model`        | `anthropic/claude-sonnet-4-20250514` | Any Vercel AI SDK model string |
| `outputDir`    | `blogs`                              | Where posts are saved          |
| `skipPatterns` | `["^Merge ", "^WIP", ...]`           | Regex patterns to skip commits |

## Project structure

```
your-repo/
├── .commitblog/
│   ├── generate.ts          # The generator (only file that matters)
│   ├── package.json         # AI SDK dependencies
│   └── node_modules/
├── .commitblog.json         # Your config
├── .git/hooks/post-commit   # Triggers generate.ts
└── blogs/                   # Output
    ├── 2025-02-10-add-jwt-auth.md
    └── 2025-02-11-fix-rate-limiting.md
```
