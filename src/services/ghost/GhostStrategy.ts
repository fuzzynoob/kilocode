import * as vscode from "vscode"
import { GhostSuggestionContext } from "./types"
import { GhostStreamingParser, StreamingParseResult } from "./GhostStreamingParser"

// Add a special marker at the cursor position to help the AI focus on autocomplete
const CURSOR_MARKER = "<<<AUTOCOMPLETE_HERE>>>"

export class GhostStrategy {
	private streamingParser: GhostStreamingParser

	constructor() {
		this.streamingParser = new GhostStreamingParser()
	}
	/**
	 * Returns the universal system prompt that defines the AI's role, capabilities,
	 * and strict output format. It's designed for broad model compatibility.
	 */
	getSystemPrompt(customInstructions: string = ""): string {
		const basePrompt = `
Task Definition
You are an expert AI programming assistant focused on providing fast, incremental code suggestions. Your task is to analyze the provided code context and user changes to infer the user's intent, then generate small, precise code modifications that can be displayed quickly to the user.

---

Priority Guidelines (CRITICAL)
1. **Cursor-First Approach**: ALWAYS prioritize suggestions at or near the cursor position (marked with <<<AUTOCOMPLETE_HERE>>>). The first suggestion should be the most immediate completion at the cursor.
2. **Small, Fast Changes**: Generate minimal, focused changes that can be processed and displayed quickly. Prefer single-line completions, small function additions, or targeted fixes over large refactors.
3. **Incremental Suggestions**: Start with the most obvious, immediate completion, then provide additional related changes if needed.
4. **Speed Over Perfection**: Favor quick, useful suggestions over comprehensive but slow transformations.

---

Required Output Format (CRITICAL)
You must adhere strictly to the following XML format. Any deviation will cause the tool to fail.

1.  **Single-Line XML**: The entire response must be a single, continuous line of XML with no line breaks between tags.
2.  **Change Blocks**: Each distinct modification must be wrapped in its own \`<change>...\</change>\` tags.
3.  **Search and Replace**: Inside each \`<change>\` block, use \`<search>\` for the code to be replaced and \`<replace>\` for the new code.
4.  **Exact Match**: The content in the \`<search>\` tag must exactly match a section of the current code, including all indentation and whitespace.
5.  **CDATA Wrappers**: All code inside \`<search>\` and \`<replace>\` tags must be wrapped in \`<![CDATA[...]]>\`.
6.  **Minimal Changes**: Prefer small, targeted changes over large block replacements. Focus on the immediate area around the cursor first.
7.  **No Overlapping Changes**: Never generate multiple \`<change>\` blocks that modify the same or overlapping lines of code.`

		// Append any dynamic custom instructions if provided
		return customInstructions ? `${basePrompt}\n\n---\n\n${customInstructions}` : basePrompt
	}

	/**
	 * Provides the static introductory part of the user-facing prompt.
	 */
	private getBaseSuggestionPrompt(): string {
		return `
## Context
`
	}

	/**
	 * Provides the static instructions that guide the model's reasoning process.
	 */
	private getInstructionsPrompt(): string {
		return `
---

## Instructions

1.  **Cursor-First Priority**: If a cursor marker (<<<AUTOCOMPLETE_HERE>>>) is present, your FIRST and PRIMARY suggestion must be the immediate completion at that exact position. This should be:
	   * The most obvious next line(s) of code
	   * A simple completion that makes syntactic sense
	   * Something that can be processed and displayed instantly
	   * Focused on the immediate context around the cursor

2.  **Analyze Intent**: Understand the user's intent from the \`Recent User Actions\`:
	   * **If code was added or modified**, assume the user wants to build upon it with small, incremental additions
	   * **If code was deleted**, assume the user wants to remove functionality with targeted deletions
	   * **If typing/editing at cursor**, focus on intelligent autocompletion and immediate next steps

3.  **Generate Fast, Small Changes**:
	   * Start with the smallest, most immediate suggestion at the cursor
	   * Prefer single-line completions, simple statements, or small code blocks
	   * Avoid large refactors or comprehensive changes that take time to process
	   * Each change should be independently useful and displayable

4.  **Response Format**: Produce a response containing only the XML-formatted changes, ordered by priority (cursor-first). Do not include any explanations, apologies, or conversational text.
`
	}

	private getFilePathPrompt(context: GhostSuggestionContext): string {
		return context.document ? `* **File Path**: \`${context.document.uri.toString()}\`` : ""
	}

	private getRecentUserActions(context: GhostSuggestionContext) {
		if (!context.recentOperations || context.recentOperations.length === 0) {
			return ""
		}
		let result = `* **Recent User Actions:**\n`
		let actionIndex = 1

		// Flatten all actions from all groups and list them individually
		context.recentOperations.forEach((action) => {
			result += `${actionIndex}. ${action.description}\n`
			if (action.content) {
				result += `\`\`\`\n${action.content}\n\`\`\`\n`
			}
			result += `\n`
			actionIndex++
		})

		return result
	}

	private getUserFocusPrompt(context: GhostSuggestionContext): string {
		if (!context.range) return ""
		const { start } = context.range
		return `* **User Focus**: Cursor at Line ${start.line + 1}, Character ${start.character + 1}`
	}

	private getUserSelectedTextPrompt(context: GhostSuggestionContext): string {
		if (!context.document || !context.range || context.range.isEmpty) return ""
		const selectedText = context.document.getText(context.range)
		return `* **Selected Text**:\n    \`\`\`${context.document.languageId}\n${selectedText}\n    \`\`\``
	}

	private getUserInputPrompt(context: GhostSuggestionContext): string {
		if (!context.userInput) return ""
		return `* **User Query**: "${context.userInput}"`
	}

	private getASTInfoPrompt(context: GhostSuggestionContext): string {
		if (!context.rangeASTNode) return ""
		const node = context.rangeASTNode
		let astInfo = `* **AST Context**:\n`
		astInfo += `    * **Current Node**: \`${node.type}\`\n`
		if (node.parent) {
			astInfo += `    * **Parent Node**: \`${node.parent.type}\`\n`
		}
		return astInfo
	}

	private getDiagnosticsPrompt(context: GhostSuggestionContext): string {
		if (!context.diagnostics || context.diagnostics.length === 0) return ""

		const formattedDiagnostics = context.diagnostics
			.map((d) => {
				const severity = vscode.DiagnosticSeverity[d.severity]
				const line = d.range.start.line + 1
				return `        * **${severity}**: ${d.message} (Line ${line})`
			})
			.join("\n")

		return `* **Active Diagnostics**:\n${formattedDiagnostics}`
	}

	private getUserCurrentDocumentPrompt(context: GhostSuggestionContext): string {
		if (!context.document) return ""

		const fullText = context.document.getText()

		// If we have a cursor position, split the document and add a marker
		if (context.range) {
			const cursorOffset = context.document.offsetAt(context.range.start)
			const beforeCursor = fullText.substring(0, cursorOffset)
			const afterCursor = fullText.substring(cursorOffset)

			return `
---

## Full Code

**Note**: The cursor is currently at the position marked with \`${CURSOR_MARKER}\`. Your FIRST suggestion must be the immediate completion at this exact position. Prioritize small, fast completions that can be displayed instantly.

\`\`\`${context.document.languageId}
${beforeCursor}${CURSOR_MARKER}${afterCursor}
\`\`\``
		}

		// Fallback to full document if no cursor position
		return `
---

## Full Code

\`\`\`${context.document.languageId}
${fullText}
\`\`\``
	}

	getSuggestionPrompt(context: GhostSuggestionContext): string {
		const contextSections = [
			this.getFilePathPrompt(context),
			this.getRecentUserActions(context),
			this.getUserInputPrompt(context),
			this.getUserFocusPrompt(context),
			this.getUserSelectedTextPrompt(context),
			this.getASTInfoPrompt(context),
			this.getDiagnosticsPrompt(context),
		]

		const promptParts = [
			this.getBaseSuggestionPrompt(),
			contextSections.filter(Boolean).join("\n"),
			this.getUserCurrentDocumentPrompt(context),
			this.getInstructionsPrompt(),
		]

		return promptParts.filter(Boolean).join("\n")
	}

	/**
	 * Initialize streaming parser for incremental parsing
	 */
	public initializeStreamingParser(context: GhostSuggestionContext): void {
		this.streamingParser.initialize(context)
	}

	/**
	 * Process a chunk of streaming response and return any newly completed suggestions
	 */
	public processStreamingChunk(chunk: string): StreamingParseResult {
		return this.streamingParser.processChunk(chunk)
	}

	/**
	 * Reset the streaming parser for a new parsing session
	 */
	public resetStreamingParser(): void {
		this.streamingParser.reset()
	}

	/**
	 * Get the current buffer content from the streaming parser (for debugging)
	 */
	public getStreamingBuffer(): string {
		return this.streamingParser.getBuffer()
	}

	/**
	 * Get completed changes from the streaming parser (for debugging)
	 */
	public getStreamingCompletedChanges() {
		return this.streamingParser.getCompletedChanges()
	}
}
