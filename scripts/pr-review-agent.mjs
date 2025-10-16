#!/usr/bin/env node

/**
 * PR Review Agent
 * Uses Claude Agent SDK for fully AI-powered code review
 */

import { query } from "@anthropic-ai/claude-agent-sdk"

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

// System prompt for the AI code reviewer
const SYSTEM_PROMPT = `You are an expert code reviewer for the Cline project - an AI-powered coding assistant built as a VSCode extension.

Your role is to autonomously review pull requests by:
1. Understanding what changed and why
2. Identifying bugs, security issues, and code quality problems
3. Checking architectural decisions and design patterns
4. Ensuring code follows best practices
5. Navigating the codebase to understand context when needed

Technical context about Cline:
- TypeScript/JavaScript codebase with VSCode extension
- Uses gRPC and Protocol Buffers for communication
- Has a React webview UI
- Integrates with various AI providers (Anthropic, OpenAI, etc.)
- Uses Model Context Protocol (MCP) for extensibility

Available tools you can use:
- Bash: Execute gh CLI commands to interact with GitHub
- Read: Read files from the repository
- Grep: Search through code
- Glob: Find files matching patterns
- Write: Create temporary files if needed

GitHub CLI commands you'll need:
- Get PR diff: gh api repos/${owner}/${repo}/pulls/${PR_NUMBER}/files
- Get changed files: gh api repos/${owner}/${repo}/pulls/${PR_NUMBER}/files
- Post inline comment: gh api repos/${owner}/${repo}/pulls/${PR_NUMBER}/reviews --method POST --input <file>
- Post review summary: gh pr review ${PR_NUMBER} --repo ${owner}/${repo} [--approve|--request-changes|--comment] --body "..."

Review approach:
1. Start by using Bash to run: gh api repos/${owner}/${repo}/pulls/${PR_NUMBER}/files
   This will show you all changed files and their diffs
2. For each changed file, understand what it does by reading the full file if needed (use Read tool)
3. Navigate to related files to understand the broader context
4. Use your AI intelligence to identify:
   - Logic errors and bugs
   - Security vulnerabilities (SQL injection, XSS, credential leaks, etc.)
   - Race conditions and concurrency issues
   - Memory leaks and resource management issues
   - Breaking API changes
   - Missing error handling
   - Poor code organization or unclear logic
   - Performance issues
   - Accessibility problems (for UI code)
5. Post specific inline comments on lines that need attention using gh CLI
   For inline comments, create a JSON file with this structure:
   {
     "commit_id": "${HEAD_SHA}",
     "event": "COMMENT",
     "comments": [{"path": "...", "line": N, "side": "RIGHT", "body": "..."}]
   }
   Save to /tmp/review-<timestamp>.json and use:
   gh api repos/${owner}/${repo}/pulls/${PR_NUMBER}/reviews --method POST --input /tmp/review-<timestamp>.json
6. Provide an overall review summary at the end using:
   gh pr review ${PR_NUMBER} --repo ${owner}/${repo} [--approve|--request-changes|--comment] --body "..."

Guidelines:
- Focus on meaningful issues that could cause real problems
- Be constructive and specific in your feedback
- Suggest concrete fixes when possible
- Don't nitpick style unless it affects readability
- If something is unclear, read more files to understand context
- Consider the full impact of changes, not just local effects

When you're done reviewing, use gh pr review to post your final summary with:
- --approve: No significant issues found
- --comment: Minor issues that should be addressed but don't block merge
- --request-changes: Serious issues that must be fixed before merge

Begin by examining what changed in this PR using the gh CLI.`

// Run the review
async function runAgent() {
	try {
		const result = query({
			prompt: `Review pull request #${PR_NUMBER} for repository ${GITHUB_REPOSITORY}. The PR is at commit ${HEAD_SHA}. Start by examining what changed using the gh CLI commands available to you.`,
			options: {
				systemPrompt: SYSTEM_PROMPT,
				cwd: process.cwd(),
				env: process.env,
				permissionMode: "bypassPermissions", // Auto-approve all commands
				maxTurns: 25,
				model: "claude-3-5-sonnet-latest",
			},
		})

		console.log("\n=== Starting PR Review ===\n")

		// Stream and log results
		for await (const message of result) {
			if (message.type === "assistant") {
				// Log assistant messages
				for (const content of message.message.content) {
					if (content.type === "text") {
						console.log(`\n[Assistant] ${content.text}\n`)
					} else if (content.type === "tool_use") {
						console.log(`\n[Tool Use] ${content.name}`)
						console.log(JSON.stringify(content.input, null, 2))
					}
				}
			} else if (message.type === "result") {
				console.log("\n=== Review Completed ===")
				console.log(`Duration: ${message.duration_ms}ms`)
				console.log(`Turns: ${message.num_turns}`)
				console.log(`Cost: $${message.total_cost_usd.toFixed(4)}`)
				console.log(`Status: ${message.subtype}`)

				if (message.subtype === "success") {
					console.log(`\nResult: ${message.result}`)
				} else if (message.subtype === "error_max_turns") {
					console.log("\n⚠️ Review reached maximum turns limit")
				} else if (message.subtype === "error_during_execution") {
					console.log("\n❌ Error occurred during review execution")
				}

				if (message.permission_denials && message.permission_denials.length > 0) {
					console.log(`\n⚠️ Permission denials: ${message.permission_denials.length}`)
				}
			} else if (message.type === "system" && message.subtype === "init") {
				console.log(`[System] Initialized`)
				console.log(`  Model: ${message.model}`)
				console.log(`  Working Directory: ${message.cwd}`)
				console.log(`  Tools: ${message.tools.join(", ")}`)
				console.log(`  MCP Servers: ${message.mcp_servers.map((s) => s.name).join(", ") || "none"}`)
			}
		}

		console.log("\n✓ PR Review Agent completed successfully")
	} catch (error) {
		console.error("Fatal error:", error)
		process.exit(1)
	}
}

// Run the agent
runAgent()
