#!/usr/bin/env node

/**
 * PR Review Agent
 * Uses Cline CLI for fully AI-powered code review
 */

import { execSync } from "node:child_process"

// Get environment variables
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY
const PR_NUMBER = process.env.PR_NUMBER
const HEAD_SHA = process.env.HEAD_SHA

if (!ANTHROPIC_API_KEY) {
	console.error("Error: ANTHROPIC_API_KEY environment variable is required")
	process.exit(1)
}

if (!GITHUB_TOKEN) {
	console.error("Error: GITHUB_TOKEN environment variable is required")
	process.exit(1)
}

if (!GITHUB_REPOSITORY || !PR_NUMBER || !HEAD_SHA) {
	console.error("Error: GitHub environment variables missing")
	process.exit(1)
}

const [owner, repo] = GITHUB_REPOSITORY.split("/")

// Set GH_TOKEN for gh CLI
process.env.GH_TOKEN = GITHUB_TOKEN

console.log(`Starting AI-powered review for ${GITHUB_REPOSITORY}#${PR_NUMBER}`)

// Configure Cline with Anthropic API key
console.log("\n=== Configuring Cline ===")
try {
	execSync(`cline config set api-key=${ANTHROPIC_API_KEY}`, {
		encoding: "utf8",
		stdio: "inherit",
	})
	console.log("✓ API key configured")
} catch (error) {
	console.error("Failed to configure API key:", error.message)
	process.exit(1)
}

// Comprehensive prompt with all instructions
const REVIEW_PROMPT = `You are an expert code reviewer for the Cline project - an AI-powered coding assistant built as a VSCode extension.

Your task is to autonomously review pull request #${PR_NUMBER} for repository ${GITHUB_REPOSITORY} at commit ${HEAD_SHA}.

TECHNICAL CONTEXT:
- TypeScript/JavaScript codebase with VSCode extension
- Uses gRPC and Protocol Buffers for communication
- Has a React webview UI
- Integrates with various AI providers (Anthropic, OpenAI, etc.)
- Uses Model Context Protocol (MCP) for extensibility

AVAILABLE TOOLS:
- Bash: Execute gh CLI commands to interact with GitHub
- Read: Read files from the repository
- Grep: Search through code
- Glob: Find files matching patterns

GITHUB CLI COMMANDS YOU'LL NEED:
1. Get PR files and diffs:
   gh api repos/${owner}/${repo}/pulls/${PR_NUMBER}/files

2. Post inline comment (create JSON file first):
   {
     "commit_id": "${HEAD_SHA}",
     "event": "COMMENT",
     "comments": [{"path": "file.js", "line": 10, "side": "RIGHT", "body": "comment"}]
   }
   Save to /tmp/review-<timestamp>.json then:
   gh api repos/${owner}/${repo}/pulls/${PR_NUMBER}/reviews --method POST --input /tmp/review-<timestamp>.json

3. Post final review summary:
   gh pr review ${PR_NUMBER} --repo ${owner}/${repo} [--approve|--request-changes|--comment] --body "summary"

REVIEW APPROACH:
1. Start by using Bash to run: gh api repos/${owner}/${repo}/pulls/${PR_NUMBER}/files
   This shows all changed files with their diffs
2. For each changed file, use Read to understand the full context if needed
3. Navigate to related files to understand broader context
4. Identify issues:
   - Logic errors and bugs
   - Security vulnerabilities (SQL injection, XSS, credential leaks, etc.)
   - Race conditions and concurrency issues
   - Memory leaks and resource management issues
   - Breaking API changes
   - Missing error handling
   - Poor code organization or unclear logic
   - Performance issues
   - Accessibility problems (for UI code)
5. Post specific inline comments for issues found using gh CLI with JSON files
6. Provide final review summary using gh pr review

GUIDELINES:
- Focus on meaningful issues that could cause real problems
- Be constructive and specific in your feedback
- Suggest concrete fixes when possible
- Don't nitpick style unless it affects readability
- Read more files if something is unclear
- Consider the full impact of changes, not just local effects

FINAL REVIEW:
When done reviewing, use gh pr review to post your summary with:
- --approve: No significant issues found
- --comment: Minor issues that should be addressed but don't block merge
- --request-changes: Serious issues that must be fixed before merge

BEGIN: Start by examining what changed in this PR using gh CLI.`

// Run the review using Cline CLI
console.log("\n=== Starting PR Review ===\n")

try {
	// Start task and follow to completion
	// The & spawns the task in background, sleep gives it time to start, then we follow it
	const output = execSync(
		`cline task new "${REVIEW_PROMPT.replace(/"/g, '\\"')}" --yolo --mode act & sleep 2 && cline task view --follow-complete --output-format plain`,
		{
			encoding: "utf8",
			stdio: "pipe",
			env: process.env,
			cwd: process.cwd(),
		},
	)

	console.log(output)
	console.log("\n✓ PR Review completed successfully")
} catch (error) {
	console.error("\n❌ PR Review failed")
	if (error.stdout) {
		console.log("\nOutput:")
		console.log(error.stdout)
	}
	if (error.stderr) {
		console.error("\nErrors:")
		console.error(error.stderr)
	}
	process.exit(1)
}
