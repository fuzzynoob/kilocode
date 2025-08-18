import * as vscode from "vscode"
import { describe, it, expect, beforeEach, vi } from "vitest"
import { GhostStrategy } from "../GhostStrategy"
import { GhostSuggestionContext } from "../types"

describe("GhostStrategy", () => {
	let strategy: GhostStrategy

	beforeEach(() => {
		strategy = new GhostStrategy()
	})

	describe("getUserCurrentDocumentPrompt", () => {
		it("should return empty string when no document is provided", () => {
			const context: GhostSuggestionContext = {
				document: null as any,
			}

			const prompt = strategy["getUserCurrentDocumentPrompt"](context)
			expect(prompt).toBe("")
		})

		it("should return full document when no cursor position is provided", () => {
			const mockDocument = {
				languageId: "typescript",
				getText: () => "const x = 1;\nconst y = 2;",
			} as vscode.TextDocument

			const context: GhostSuggestionContext = {
				document: mockDocument,
			}

			const prompt = strategy["getUserCurrentDocumentPrompt"](context)
			expect(prompt).toContain("## Full Code")
			expect(prompt).toContain("```typescript")
			expect(prompt).toContain("const x = 1;\nconst y = 2;")
			expect(prompt).not.toContain("<<<AUTOCOMPLETE_HERE>>>")
		})

		it("should add cursor marker when cursor position is provided", () => {
			const mockDocument = {
				languageId: "typescript",
				getText: () => "const x = 1;\nconst y = 2;",
				offsetAt: (position: vscode.Position) => 13, // Position after "const x = 1;\n"
			} as vscode.TextDocument

			const mockRange = {
				isEmpty: false,
				start: { line: 1, character: 0 } as vscode.Position,
			} as vscode.Range

			const context: GhostSuggestionContext = {
				document: mockDocument,
				range: mockRange,
			}

			const prompt = strategy["getUserCurrentDocumentPrompt"](context)
			expect(prompt).toContain("## Full Code")
			expect(prompt).toContain("<<<AUTOCOMPLETE_HERE>>>")
			expect(prompt).toContain("const x = 1;\n<<<AUTOCOMPLETE_HERE>>>const y = 2;")
			expect(prompt).toContain("Your FIRST suggestion must be the immediate completion at this exact position")
		})

		it("should handle cursor at beginning of document", () => {
			const mockDocument = {
				languageId: "javascript",
				getText: () => "function test() {\n  return true;\n}",
				offsetAt: (position: vscode.Position) => 0,
			} as vscode.TextDocument

			const mockRange = {
				isEmpty: false,
				start: { line: 0, character: 0 } as vscode.Position,
			} as vscode.Range

			const context: GhostSuggestionContext = {
				document: mockDocument,
				range: mockRange,
			}

			const prompt = strategy["getUserCurrentDocumentPrompt"](context)
			expect(prompt).toContain("<<<AUTOCOMPLETE_HERE>>>function test()")
		})

		it("should handle cursor at end of document", () => {
			const documentText = "const a = 1;"
			const mockDocument = {
				languageId: "javascript",
				getText: () => documentText,
				offsetAt: (position: vscode.Position) => documentText.length,
			} as vscode.TextDocument

			const mockRange = {
				isEmpty: false,
				start: { line: 0, character: 12 } as vscode.Position,
			} as vscode.Range

			const context: GhostSuggestionContext = {
				document: mockDocument,
				range: mockRange,
			}

			const prompt = strategy["getUserCurrentDocumentPrompt"](context)
			expect(prompt).toContain("const a = 1;<<<AUTOCOMPLETE_HERE>>>")
		})
	})

	describe("getInstructionsPrompt", () => {
		it("should include autocomplete instructions", () => {
			const instructions = strategy["getInstructionsPrompt"]()
			expect(instructions).toContain("<<<AUTOCOMPLETE_HERE>>>")
			expect(instructions).toContain(
				"your FIRST and PRIMARY suggestion must be the immediate completion at that exact position",
			)
		})
	})

	// Note: findBestMatch method was moved to GhostStreamingParser during streaming refactor
	// These tests are now covered by GhostStreamingParser.test.ts

	describe("getSuggestionPrompt", () => {
		it("should combine all prompt sections correctly", () => {
			const mockDocument = {
				languageId: "typescript",
				getText: () => "const x = 1;",
				uri: { toString: () => "file:///test.ts" },
			} as vscode.TextDocument

			const context: GhostSuggestionContext = {
				document: mockDocument,
				userInput: "Complete this function",
				diagnostics: [
					{
						severity: vscode.DiagnosticSeverity.Error,
						message: "Missing semicolon",
						range: {
							start: { line: 0, character: 12 } as vscode.Position,
						} as vscode.Range,
					} as vscode.Diagnostic,
				],
			}

			const prompt = strategy.getSuggestionPrompt(context)

			expect(prompt).toContain("## Context")
			expect(prompt).toContain("## Instructions")
			expect(prompt).toContain("## Full Code")
			expect(prompt).toContain("file:///test.ts")
			expect(prompt).toContain("Complete this function")
			expect(prompt).toContain("Missing semicolon")
		})
	})
})
