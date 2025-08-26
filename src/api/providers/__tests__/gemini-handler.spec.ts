import { describe, it, expect, vi, beforeEach } from "vitest"
import { t } from "i18next"
import { GeminiHandler } from "../gemini"
import type { ApiHandlerOptions } from "../../../shared/api"

describe("GeminiHandler backend support", () => {
	let originalExecuteWithRetry: any

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks()
	})

	it("passes tools for URL context and grounding in config", async () => {
		const options = {
			apiProvider: "gemini",
			geminiApiKey: "test-key-1,test-key-2", // Add test keys
			enableUrlContext: true,
			enableGrounding: true,
		} as ApiHandlerOptions
		const handler = new GeminiHandler(options)

		// Mock the executeWithRetry method to capture the client operation
		let capturedConfig: any
		const mockStream = async function* () {
			// Empty stream for test
		}

		const mockExecuteWithRetry = vi.fn().mockImplementation(async (operation) => {
			const mockClient = {
				models: {
					generateContentStream: vi.fn().mockReturnValue(mockStream()),
				},
			}
			const result = await operation(mockClient, "test-key")
			capturedConfig = mockClient.models.generateContentStream.mock.calls[0]?.[0]?.config
			return result
		})

		// @ts-ignore access private method
		handler["executeWithRetry"] = mockExecuteWithRetry

		await handler.createMessage("instr", [] as any).next()
		expect(capturedConfig.tools).toEqual([{ urlContext: {} }, { googleSearch: {} }])
	})

	it("completePrompt passes config overrides without tools when URL context and grounding disabled", async () => {
		const options = {
			apiProvider: "gemini",
			geminiApiKey: "test-key-1,test-key-2", // Add test keys
			enableUrlContext: false,
			enableGrounding: false,
		} as ApiHandlerOptions
		const handler = new GeminiHandler(options)

		// Mock the executeWithRetry method to capture the client operation
		let capturedConfig: any
		const mockExecuteWithRetry = vi.fn().mockImplementation(async (operation) => {
			const mockClient = {
				models: {
					generateContent: vi.fn().mockResolvedValue({ text: "ok" }),
				},
			}
			const result = await operation(mockClient, "test-key")
			capturedConfig = mockClient.models.generateContent.mock.calls[0]?.[0]?.config
			return result
		})

		// @ts-ignore access private method
		handler["executeWithRetry"] = mockExecuteWithRetry

		const res = await handler.completePrompt("hi")
		expect(res).toBe("ok")
		expect(capturedConfig.tools).toBeUndefined()
	})

	describe("error scenarios", () => {
		it("should handle grounding metadata extraction failure gracefully", async () => {
			const options = {
				apiProvider: "gemini",
				geminiApiKey: "test-key-1,test-key-2", // Add test keys
				enableGrounding: true,
			} as ApiHandlerOptions
			const handler = new GeminiHandler(options)

			const mockStream = async function* () {
				yield {
					candidates: [
						{
							groundingMetadata: {
								// Invalid structure - missing groundingChunks
							},
							content: { parts: [{ text: "test response" }] },
						},
					],
					usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
				}
			}

			// Mock the executeWithRetry method
			const mockExecuteWithRetry = vi.fn().mockImplementation(async (operation) => {
				const mockClient = {
					models: {
						generateContentStream: vi.fn().mockReturnValue(mockStream()),
					},
				}
				return await operation(mockClient, "test-key")
			})

			// @ts-ignore access private method
			handler["executeWithRetry"] = mockExecuteWithRetry

			const messages = []
			for await (const chunk of handler.createMessage("test", [] as any)) {
				messages.push(chunk)
			}

			// Should still return the main content without sources
			expect(messages.some((m) => m.type === "text" && m.text === "test response")).toBe(true)
			expect(messages.some((m) => m.type === "text" && m.text?.includes("Sources:"))).toBe(false)
		})

		it("should handle malformed grounding metadata", async () => {
			const options = {
				apiProvider: "gemini",
				geminiApiKey: "test-key-1,test-key-2", // Add test keys
				enableGrounding: true,
			} as ApiHandlerOptions
			const handler = new GeminiHandler(options)

			const mockStream = async function* () {
				yield {
					candidates: [
						{
							groundingMetadata: {
								groundingChunks: [
									{ web: null }, // Missing URI
									{ web: { uri: "https://example.com" } }, // Valid
									{}, // Missing web property entirely
								],
							},
							content: { parts: [{ text: "test response" }] },
						},
					],
					usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
				}
			}

			// Mock the executeWithRetry method
			const mockExecuteWithRetry = vi.fn().mockImplementation(async (operation) => {
				const mockClient = {
					models: {
						generateContentStream: vi.fn().mockReturnValue(mockStream()),
					},
				}
				return await operation(mockClient, "test-key")
			})

			// @ts-ignore access private method
			handler["executeWithRetry"] = mockExecuteWithRetry

			const messages = []
			for await (const chunk of handler.createMessage("test", [] as any)) {
				messages.push(chunk)
			}

			// Should only include valid citations
			const sourceMessage = messages.find((m) => m.type === "text" && m.text?.includes("[2]"))
			expect(sourceMessage).toBeDefined()
			if (sourceMessage && "text" in sourceMessage) {
				expect(sourceMessage.text).toContain("https://example.com")
				expect(sourceMessage.text).not.toContain("[1]")
				expect(sourceMessage.text).not.toContain("[3]")
			}
		})

		it("should handle API errors when tools are enabled", async () => {
			const options = {
				apiProvider: "gemini",
				geminiApiKey: "test-key-1,test-key-2", // Add test keys
				enableUrlContext: true,
				enableGrounding: true,
			} as ApiHandlerOptions
			const handler = new GeminiHandler(options)

			const mockError = new Error("API rate limit exceeded")

			// Mock the executeWithRetry method to throw an error
			const mockExecuteWithRetry = vi.fn().mockRejectedValue(mockError)

			// @ts-ignore access private method
			handler["executeWithRetry"] = mockExecuteWithRetry

			const messages = []
			for await (const chunk of handler.createMessage("test", [] as any)) {
				messages.push(chunk)
			}

			// Should return fallback message when API error occurs
			expect(messages.some((m) => m.type === "text" && m.text?.includes("technical difficulties"))).toBe(true)
			expect(messages.some((m) => m.type === "usage")).toBe(true)
		})
	})
})
