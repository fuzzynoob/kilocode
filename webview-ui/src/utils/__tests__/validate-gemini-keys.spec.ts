import { describe, expect, it, vi } from "vitest"
import { validateApiConfiguration } from "../validate"
import { ProviderSettings } from "@roo-code/types"

// Mock i18next
vi.mock("i18next", () => ({
	default: {
		t: vi.fn((key: string) => {
			const translations: Record<string, string> = {
				"settings:validation.apiKey": "You must provide a valid API key.",
			}
			return translations[key] || key
		}),
	},
}))

describe("validateApiConfiguration - Gemini Keys", () => {
	const baseConfig: ProviderSettings = {
		apiProvider: "gemini" as const,
		apiModelId: "gemini-1.5-pro-latest",
	}

	describe("single key validation", () => {
		it("should accept valid single API key", () => {
			const config: ProviderSettings = {
				...baseConfig,
				geminiApiKey: "valid-api-key-123",
			}

			const result = validateApiConfiguration(config)
			expect(result).toBeUndefined() // No validation error
		})

		it("should reject empty single API key", () => {
			const config: ProviderSettings = {
				...baseConfig,
				geminiApiKey: "",
			}

			const result = validateApiConfiguration(config)
			expect(result).toBe("You must provide a valid API key.")
		})

		it("should reject whitespace-only single API key", () => {
			const config: ProviderSettings = {
				...baseConfig,
				geminiApiKey: "   ",
			}

			const result = validateApiConfiguration(config)
			expect(result).toBe("You must provide a valid API key.")
		})
	})

	describe("multiple keys validation", () => {
		it("should accept valid multiple API keys", () => {
			const config: ProviderSettings = {
				...baseConfig,
				geminiApiKeys: "key1\nkey2\nkey3",
			}

			const result = validateApiConfiguration(config)
			expect(result).toBeUndefined() // No validation error
		})

		it("should accept single key in multiple keys format", () => {
			const config: ProviderSettings = {
				...baseConfig,
				geminiApiKeys: "single-key-in-multiline-format",
			}

			const result = validateApiConfiguration(config)
			expect(result).toBeUndefined() // No validation error
		})

		it("should accept multiple keys with empty lines", () => {
			const config: ProviderSettings = {
				...baseConfig,
				geminiApiKeys: "key1\n\n\nkey2\n  \nkey3\n",
			}

			const result = validateApiConfiguration(config)
			expect(result).toBeUndefined() // No validation error
		})

		it("should reject empty multiple keys", () => {
			const config: ProviderSettings = {
				...baseConfig,
				geminiApiKeys: "",
			}

			const result = validateApiConfiguration(config)
			expect(result).toBe("You must provide a valid API key.")
		})

		it("should reject multiple keys with only whitespace", () => {
			const config: ProviderSettings = {
				...baseConfig,
				geminiApiKeys: "\n  \n\t\n   ",
			}

			const result = validateApiConfiguration(config)
			expect(result).toBe("You must provide a valid API key.")
		})
	})

	describe("priority - multiple keys over single key", () => {
		it("should accept when both single and multiple keys are provided", () => {
			const config: ProviderSettings = {
				...baseConfig,
				geminiApiKey: "single-key",
				geminiApiKeys: "multi-key1\nmulti-key2",
			}

			const result = validateApiConfiguration(config)
			expect(result).toBeUndefined() // No validation error
		})

		it("should reject when single key is empty but multiple keys are valid", () => {
			const config: ProviderSettings = {
				...baseConfig,
				geminiApiKey: "",
				geminiApiKeys: "multi-key1\nmulti-key2",
			}

			const result = validateApiConfiguration(config)
			expect(result).toBeUndefined() // Should accept multiple keys
		})

		it("should reject when multiple keys are empty but single key is valid", () => {
			const config: ProviderSettings = {
				...baseConfig,
				geminiApiKey: "single-key",
				geminiApiKeys: "",
			}

			const result = validateApiConfiguration(config)
			expect(result).toBeUndefined() // Should accept single key
		})
	})

	describe("no keys provided", () => {
		it("should reject when no keys are provided", () => {
			const config: ProviderSettings = {
				...baseConfig,
				// No geminiApiKey or geminiApiKeys
			}

			const result = validateApiConfiguration(config)
			expect(result).toBe("You must provide a valid API key.")
		})

		it("should reject when both keys are undefined", () => {
			const config: ProviderSettings = {
				...baseConfig,
				geminiApiKey: undefined,
				geminiApiKeys: undefined,
			}

			const result = validateApiConfiguration(config)
			expect(result).toBe("You must provide a valid API key.")
		})
	})
})
