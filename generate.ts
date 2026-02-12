import { generateText } from "ai";
import { execSync } from "child_process";
import { config as loadEnvConfig } from "dotenv";
import {
  appendFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from "fs";
import { join } from "path";
import * as notifier from "node-notifier";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

// ─────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────

interface Config {
  model: string;
  outputDir: string;
  skipPatterns: string[];
}

function getRepoRoot(): string {
  const root = git("rev-parse --show-toplevel");
  if (!root) {
    throw new Error("Unable to resolve repository root.");
  }
  return root;
}

function loadRootEnv(repoRoot: string): void {
  loadEnvConfig({
    path: join(repoRoot, ".env"),
    override: true,
  });
}

function loadConfig(repoRoot: string): Config {
  const configPath = join(repoRoot, ".commitblog.json");
  const defaults: Config = {
    model: "anthropic/claude-sonnet-4-20250514",
    outputDir: "blogs",
    skipPatterns: ["^Merge ", "^WIP", "^fixup!", "^chore:"],
  };

  if (existsSync(configPath)) {
    const userConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    return { ...defaults, ...userConfig };
  }
  return defaults;
}

// ─────────────────────────────────────────────────────────
// Git context extraction
// ─────────────────────────────────────────────────────────

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function getCommitContext() {
  const commitMessage = git('log -1 --format="%s"');
  const commitBody = git('log -1 --format="%b"');
  const author = git('log -1 --format="%an"');
  const date = git('log -1 --format="%aI"');
  const hash = git('log -1 --format="%h"');
  const branch = git("branch --show-current");
  const diff = git("diff HEAD~1..HEAD");
  const diffStat = git("diff HEAD~1..HEAD --stat");
  const filesChanged = git("diff HEAD~1..HEAD --name-only")
    .split("\n")
    .filter(Boolean);

  return {
    commitMessage,
    commitBody,
    author,
    date,
    hash,
    branch,
    diff,
    diffStat,
    filesChanged,
  };
}

function truncateDiff(diff: string, maxLines = 400): string {
  const lines = diff.split("\n");
  if (lines.length <= maxLines) return diff;

  const half = Math.floor(maxLines / 2);
  return [
    ...lines.slice(0, half),
    `\n... (${lines.length - maxLines} lines omitted for brevity) ...\n`,
    ...lines.slice(-half),
  ].join("\n");
}

type CommitBlogModel = Parameters<typeof generateText>[0]["model"];
type ProgressLogger = (message: string) => void;

function createProgressLogger(repoRoot: string): ProgressLogger {
  const progressDir = join(repoRoot, ".commitblog");
  mkdirSync(progressDir, { recursive: true });
  const progressFile = join(progressDir, "last-run.log");
  writeFileSync(progressFile, "");

  return (message: string): void => {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    appendFileSync(progressFile, `${line}\n`);
  };
}

function escapeAppleScriptValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function notify(title: string, message: string): void {
  if (process.platform === "darwin") {
    const script = `display notification "${escapeAppleScriptValue(
      message
    )}" with title "${escapeAppleScriptValue(title)}"`;
    try {
      execSync(`osascript -e "${script}"`, { stdio: "ignore" });
      return;
    } catch (error) {
      const ignoredError: unknown = error;
      void ignoredError;
    }
  }

  try {
    notifier.notify({
      title,
      message,
      sound: true,
      wait: false,
    });
  } catch (error) {
    const ignoredError: unknown = error;
    void ignoredError;
  }
}

function getRequiredApiKey(modelId: string): string | null {
  const slashIndex = modelId.indexOf("/");
  if (slashIndex === -1) {
    return null;
  }
  const provider = modelId.substring(0, slashIndex);
  if (provider === "google") return "GOOGLE_GENERATIVE_AI_API_KEY";
  if (provider === "openai") return "OPENAI_API_KEY";
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "groq") return "GROQ_API_KEY";
  if (provider === "openrouter") return "OPENROUTER_API_KEY";
  return null;
}

async function askForRedo(): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return false;
  }
  const rl = createInterface({ input, output });
  const answer = await rl.question(
    "Fix the issue, then type 'r' to retry (anything else to exit): "
  );
  rl.close();
  return answer.trim().toLowerCase() === "r";
}

async function resolveCommitBlogModel(modelId: string): Promise<CommitBlogModel> {
  const slashIndex = modelId.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model format: "${modelId}". Use "provider/model-name".`
    );
  }

  const provider = modelId.substring(0, slashIndex);
  const modelName = modelId.substring(slashIndex + 1);

  switch (provider) {
    case "google": {
      const { google } = await import("@ai-sdk/google");
      return google(modelName);
    }
    case "openai": {
      const { openai } = await import("@ai-sdk/openai");
      return openai(modelName);
    }
    case "anthropic": {
      const { anthropic } = await import("@ai-sdk/anthropic");
      return anthropic(modelName);
    }
    case "groq": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const groq = createOpenAI({
        baseURL: "https://api.groq.com/openai/v1",
        apiKey: process.env.GROQ_API_KEY,
        name: "groq",
      });
      return groq.chat(modelName);
    }
    case "openrouter": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const openrouter = createOpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY,
        name: "openrouter",
      });
      return openrouter.chat(modelName);
    }
    default:
      throw new Error(
        `Unknown provider: "${provider}". Supported: google, openai, anthropic, groq, openrouter`
      );
  }
}

// ─────────────────────────────────────────────────────────
// System prompt — the core of blog quality
// ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior staff engineer writing a blog post for your company's engineering blog. You write genuine blog posts — the kind engineers share on Hacker News and Twitter because they learned something from reading them.

## THE DIFFERENCE BETWEEN A BLOG POST AND A CHANGELOG

You are NOT writing a changelog, release note, PR description, or commit summary. Those enumerate what changed. A blog post tells a story about WHY something changed and what you learned along the way.

A changelog says: "Replaced tsx with bun run for CLI scripts. Removed package-lock.json. Deleted tsconfig.agent.json."

A blog post says: "We had two lockfiles fighting each other. Every dependency bump generated thousands of lines of diff that nobody reviewed. Here's how we picked a lane and what broke when we did."

The reader should walk away with an insight or opinion they didn't have before — not just knowledge of what files you touched.

## YOUR VOICE

You're an engineer telling another engineer about something interesting you figured out. Not presenting at a conference. Not writing documentation. Just talking.

You never sound like AI:
- No "In this blog post, we will explore..." — start with the story
- No "Let's dive in" / "Without further ado" / "In today's fast-paced world"
- No "It's worth noting" / "Interestingly" / "It's important to understand"
- No "robust" / "seamless" / "leverage" / "utilize" / "cutting-edge" / "game-changer"
- No "comprehensive" / "streamline" / "empower" / "harness the power of"
- No filler paragraphs that restate what was just said
- Never end with "In conclusion" or summarize what was already covered
- Do not use exclamation marks

Your sentences vary in length. Some are three words. Others run longer because the idea demands it. You use contractions. You start sentences with "And" or "But" when it feels right.

## NARRATIVE STRUCTURE

Tell a story with this shape:

1. **The situation (2-4 sentences):** What was happening. What friction or pain existed. Drop the reader into the middle of it — don't set up with background paragraphs. Make them feel the annoyance or confusion that motivated the change.

2. **The thinking:** This is the heart of the post. Not what you did, but how you thought about it. What options did you consider? What was the real tradeoff? What's the underlying principle or mental model? This is where the reader learns something transferable — something they can apply to their own codebase even if they use completely different tools.

3. **What you actually did (briefly):** A paragraph or two covering the concrete changes. Mention specific files and tools by name, but don't walk through every change. The reader can look at the commit if they want the full diff.

4. **The interesting part nobody talks about:** Consequences, surprises, edges. What broke? What got simpler in ways you didn't expect? What's the implicit bet you're making? This is often the most valuable section.

5. **A closing thought (1-2 sentences):** Not a summary. An opinion, a question, or a forward-looking thought that leaves the reader thinking.

## CODE: LESS IS MORE

Code should appear only when it illustrates an insight that prose cannot. One or two short snippets maximum per post. Show the code that makes the reader go "oh, that's clever" or "I didn't know you could do that" — not the code that shows what files you edited.

Never show diff hunks. This is a blog, not a code review. If you reference a code change, describe it in prose and optionally show the final state in a small snippet.

Never enumerate changes file-by-file or section-by-section. That's a changelog.

## SECTION HEADINGS

Use headings sparingly — only when the post is long enough to need navigation. Prefer 2-3 headings maximum. Headings should be conversational and interesting, not mechanical labels like "The Approach" or "Results". Think more like "Two lockfiles, zero reviewers" or "The dependency cascade nobody asked for".

## DIAGRAMS

Use a mermaid diagram only when architecture or data flow genuinely needs visualization. Most posts don't need one. Never add a diagram just because you can.

## SEO

Title should be specific and searchable. Engineers search for technologies and problems — "Why We Dropped tsx for Bun in Our TypeScript Monorepo" beats "Simplifying Our Build Tooling".

Tags: specific technologies from the diff, not generic categories.

Description: One sentence a human would write as a tweet. Not marketing.

## OUTPUT FORMAT

Return ONLY the markdown content. Start with YAML frontmatter, then the post body.

\`\`\`yaml
---
title: "Specific, Searchable Title"
date: "YYYY-MM-DD"
author: "Author Name"
tags: ["specific-tech", "problem-domain"]
description: "Tweet-length sentence about the core insight."
---
\`\`\``;

// ─────────────────────────────────────────────────────────
// Generate
// ─────────────────────────────────────────────────────────

async function generate(repoRoot: string, logProgress: ProgressLogger): Promise<boolean> {
  logProgress("1/5 Loading config");
  loadRootEnv(repoRoot);
  const config = loadConfig(repoRoot);
  const requiredApiKey = getRequiredApiKey(config.model);
  if (requiredApiKey && !process.env[requiredApiKey]) {
    const message = `Missing ${requiredApiKey} in ${join(repoRoot, ".env")}`;
    logProgress(`Failed: ${message}`);
    notify("commitblog", message);
    return false;
  }
  logProgress("2/5 Reading commit context");
  const ctx = getCommitContext();

  // Skip commits that match ignore patterns
  if (
    config.skipPatterns.some((pattern) =>
      new RegExp(pattern).test(ctx.commitMessage)
    )
  ) {
    logProgress(`Skipping commit: "${ctx.commitMessage}"`);
    return true;
  }

  // Skip empty diffs
  if (!ctx.diff) {
    logProgress("No diff found, skipping.");
    return true;
  }

  const userPrompt = `Write a blog post inspired by this commit. The commit is your raw material — extract the story, the thinking, and the insight from it. Do NOT enumerate the changes file by file.

## Commit
**Message:** ${ctx.commitMessage}
**Body:** ${ctx.commitBody || "None"}
**Branch:** ${ctx.branch}
**Author:** ${ctx.author}
**Date:** ${ctx.date.slice(0, 10)}

## Files Changed
${ctx.diffStat}

## Diff
\`\`\`diff
${truncateDiff(ctx.diff)}
\`\`\`

Use the author name "${ctx.author}" and date "${ctx.date.slice(0, 10)}" in the frontmatter. Derive tags from the actual technologies visible in the diff. Remember: blog post, not changelog.`;

  console.log(`\n  commitblog`);
  console.log(`  ──────────────────────────────────`);
  console.log(`  Commit:  "${ctx.commitMessage}"`);
  console.log(`  Model:   ${config.model}`);
  console.log(`  Files:   ${ctx.filesChanged.length} changed`);
  console.log(`  Diff:    ${ctx.diff.split("\n").length} lines`);
  console.log(`  ──────────────────────────────────\n`);

  try {
    logProgress("3/5 Resolving model");
    const model = await resolveCommitBlogModel(config.model);
    logProgress("4/5 Generating blog draft");
    const { text } = await generateText({
      model,
      system: SYSTEM_PROMPT,
      prompt: userPrompt,
    });

    // Clean — strip wrapping fences if the model added them
    let content = text.trim();
    if (content.startsWith("```markdown")) content = content.slice(11);
    if (content.startsWith("```md")) content = content.slice(5);
    if (content.endsWith("```")) content = content.slice(0, -3);
    content = content.trim();

    // Save
    const outputDir = join(repoRoot, config.outputDir);
    mkdirSync(outputDir, { recursive: true });

    const slug = ctx.commitMessage
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

    const filename = `${ctx.date.slice(0, 10)}-${slug}.md`;
    const filepath = join(outputDir, filename);

    writeFileSync(filepath, content, "utf-8");
    logProgress(`5/5 Done -> ${filepath}`);
    notify("commitblog", `Blog generated: ${filename}`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logProgress(`Failed: ${message}`);
    notify("commitblog", `Failed: ${message}`);
    return false;
  }
}

async function run(): Promise<void> {
  const repoRoot = getRepoRoot();
  const logProgress = createProgressLogger(repoRoot);
  logProgress("commitblog started");

  while (true) {
    const success = await generate(repoRoot, logProgress);
    if (success) {
      return;
    }
    const shouldRetry = await askForRedo();
    if (!shouldRetry) {
      process.exit(1);
    }
    logProgress("Re-running after user requested retry");
  }
}

run();
