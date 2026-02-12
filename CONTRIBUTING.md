# Contributing

Thanks for contributing to `commitblog`.

## Development setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Optional: install local git hook for this repo:

   ```bash
   npm run install-hook
   ```

3. Run the generator manually:

   ```bash
   npm run generate
   ```

## Pull request guidelines

- Keep changes focused and small when possible.
- Update `README.md` when behavior or setup changes.
- Preserve backward compatibility for existing `.commitblog.json` fields.
- Avoid introducing provider-specific behavior unless guarded by config.

## Commit conventions

- Use clear, imperative commit messages (e.g., `Add Groq provider support`).
- If a commit intentionally changes output format, mention it in the message.

## Reporting issues

When opening an issue, include:

- Node version
- Operating system
- Selected model from `.commitblog.json`
- Error output from `.commitblog/last-run.log`
