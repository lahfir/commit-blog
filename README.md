# commitblog

Generate a technical blog post automatically after every git commit.

`commitblog` reads your latest commit message and diff, asks an LLM to write a post, and saves a markdown draft to your chosen output directory.

## Why this exists

Most engineering teams want to publish more technical writing, but writing always loses to shipping.  
This project turns the work you already did (your commit) into a first-pass post you can quickly polish and publish.

## How it works

```text
git commit
  -> .git/hooks/post-commit
  -> run .commitblog/generate.ts
  -> read commit metadata + diff
  -> generate post with Vercel AI SDK
  -> save markdown file in blogs/
```

## Features

- Uses real commit context (message, author, diff stats, files changed)
- Supports multiple providers via model string (`anthropic/*`, `openai/*`, `google/*`, `groq/*`, `openrouter/*`)
- Skips noisy commits with configurable patterns
- Writes generation progress to `.commitblog/last-run.log`
- Sends desktop notifications for success/failure

## Quick start

### 1) Clone and install this tool into a repo

```bash
git clone https://github.com/yourname/commitblog /tmp/commitblog
cd /path/to/your-project
bash /tmp/commitblog/install.sh
```

### 2) Add API keys in your project root `.env`

```bash
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
```

You only need the key for the provider used by your selected model.

### 3) Commit as normal

```bash
git add .
git commit -m "Refactor auth middleware"
```

`commitblog` runs after commit and writes a post file like:

```text
blogs/2026-02-11-refactor-auth-middleware.md
```

## Configuration

Create `.commitblog.json` in your project root:

```json
{
  "model": "anthropic/claude-sonnet-4-20250514",
  "outputDir": "blogs",
  "skipPatterns": ["^Merge ", "^WIP", "^fixup!", "^chore:"]
}
```

| Field          | Default                                     | Description                          |
| -------------- | ------------------------------------------- | ------------------------------------ |
| `model`        | `anthropic/claude-sonnet-4-20250514`        | Vercel AI SDK model ID               |
| `outputDir`    | `blogs`                                     | Output directory for generated posts |
| `skipPatterns` | `["^Merge ", "^WIP", "^fixup!", "^chore:"]` | Regex patterns that skip generation  |

## Usage tips

- Skip one commit manually:

  ```bash
  COMMITBLOG_SKIP=1 git commit -m "wip"
  ```

- Retry after fixing an issue: the script prompts for `r` to re-run.
- Generated markdown is a draft; review/edit before publishing.

## Repository structure

```text
commitblog/
├── generate.ts       # Main generator script
├── post-commit       # Git hook template
├── install.sh        # Installer for target repositories
├── package.json      # Runtime metadata and scripts
├── CONTRIBUTING.md   # Contribution guide
└── README.md         # Project documentation
```

## Development

```bash
npm install
npm run generate
```

Install the hook in this repo for local testing:

```bash
npm run install-hook
```

## Contributing

See `CONTRIBUTING.md` for workflow and standards.

## License

MIT — see `LICENSE`.
