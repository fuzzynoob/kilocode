import type { Anthropic } from "@anthropic-ai/sdk"
import {
	GoogleGenAI,
	type GenerateContentResponseUsageMetadata,
	type GenerateContentParameters,
	type GenerateContentConfig,
	type GroundingMetadata,
	FinishReason, // kilocode_change
} from "@google/genai"
import type { JWTInput } from "google-auth-library"

import {
	type ModelInfo,
	// type GeminiModelId, // kilocode_change
	geminiDefaultModelId,
	geminiModels,
} from "@roo-code/types"

import type {
	ApiHandlerOptions,
	ModelRecord, // kilocode_change
} from "../../shared/api"
import { safeJsonParse } from "../../shared/safeJsonParse"

import { convertAnthropicContentToGemini, convertAnthropicMessageToGemini } from "../transform/gemini-format"
import { t } from "i18next"
import type { ApiStream, GroundingSource } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { BaseProvider } from "./base-provider"
import { GeminiKeyManager } from "./gemini-key-manager"
import { throwMaxCompletionTokensReachedError } from "./kilocode/verifyFinishReason"
import { getGeminiModels } from "./fetchers/gemini" // kilocode_change

type GeminiHandlerOptions = ApiHandlerOptions & {
	isVertex?: boolean
}

export class GeminiHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions

	private keyManager: GeminiKeyManager
	private isVertex: boolean
	private project: string
	private location: string
	private _testClient?: GoogleGenAI // For testing purposes

	// kilocode_change start
	private models: ModelRecord = { ...geminiModels }
	private modelsLoaded = false
	private modelsLoading?: Promise<void>
	private readonly isVertex: boolean
	// kilocode_change end

	constructor({ isVertex, ...options }: GeminiHandlerOptions) {
		super()

		this.options = options
		this.isVertex = !!isVertex // kilocode_change
		this.project = this.options.vertexProjectId ?? "not-provided"
		this.location = this.options.vertexRegion ?? "not-provided"

		// Initialize key manager with multiple keys or fallback to single key
		const multiKeys = this.options.geminiApiKeys
		const singleKey = this.options.geminiApiKey

		console.log("[GeminiHandler] Initializing with keys:", {
			hasMultiKeys: !!(multiKeys && multiKeys.trim()),
			hasSingleKey: !!(singleKey && singleKey.trim()),
			multiKeysLength: multiKeys
				? multiKeys
						.trim()
						.split(/\r?\n/)
						.filter((k) => k.trim()).length
				: 0,
			singleKeyPrefix: singleKey ? singleKey.substring(0, 10) + "..." : "none",
		})

		if (multiKeys && multiKeys.trim()) {
			this.keyManager = new GeminiKeyManager(multiKeys)
			console.log("[GeminiHandler] Using multiple keys mode with", this.keyManager.getKeyCount(), "keys")
		} else if (singleKey && singleKey.trim()) {
			this.keyManager = GeminiKeyManager.fromSingleKey(singleKey)
			console.log("[GeminiHandler] Using single key mode")
		} else {
			this.keyManager = new GeminiKeyManager()
			console.log("[GeminiHandler] No keys configured - empty key manager")
		}
	}

	/**
	 * Get client for testing purposes
	 */
	private get client(): GoogleGenAI {
		if (this._testClient) {
			return this._testClient
		}
		// For testing, create a client with the first available key
		const key = this.keyManager.getCurrentKey()
		if (!key) {
			// Create a test client with a dummy key for testing
			return this.createClient("test-key")
		}
		return this.createClient(key)
	}

	/**
	 * Create GoogleGenAI client with the given API key
	 */
	private createClient(apiKey: string): GoogleGenAI {
		if (this.options.vertexJsonCredentials) {
			return new GoogleGenAI({
				vertexai: true,
				project: this.project,
				location: this.location,
				googleAuthOptions: {
					credentials: safeJsonParse<JWTInput>(this.options.vertexJsonCredentials, undefined),
				},
			})
		}

		if (this.options.vertexKeyFile) {
			return new GoogleGenAI({
				vertexai: true,
				project: this.project,
				location: this.location,
				googleAuthOptions: { keyFile: this.options.vertexKeyFile },
			})
		}

		if (this.isVertex) {
			return new GoogleGenAI({
				vertexai: true,
				project: this.project,
				location: this.location,
			})
		}

		return new GoogleGenAI({ apiKey })
	}

	/**
	 * Execute an operation with retry logic across multiple API keys
	 */
	private async executeWithRetry<T>(operation: (client: GoogleGenAI, apiKey: string) => Promise<T>): Promise<T> {
		console.log("[GeminiHandler] executeWithRetry starting:", {
			isConfigured: this.keyManager.isConfigured(),
			totalKeys: this.keyManager.getKeyCount(),
			availableKeys: this.keyManager.getAvailableKeys().length,
			failedKeys: this.keyManager.getFailedKeys().length,
		})

		if (!this.keyManager.isConfigured()) {
			console.error("[GeminiHandler] No keys configured!")
			throw new Error(t("common:errors.gemini.no_api_key"))
		}

		const maxAttempts = Math.min(this.keyManager.getKeyCount(), 3) // Max 3 attempts
		let lastError: Error | null = null

		console.log("[GeminiHandler] Will attempt", maxAttempts, "times")

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			// Use round-robin from shuffled key list
			const currentKey = this.keyManager.getCurrentKey()

			console.log(`[GeminiHandler] Attempt ${attempt + 1}/${maxAttempts}:`, {
				currentKeyPrefix: currentKey ? currentKey.substring(0, 10) + "..." : "null",
				availableKeys: this.keyManager.getAvailableKeys().length,
				failedKeys: this.keyManager.getFailedKeys().length,
				usingShuffledRoundRobin: true,
			})

			if (!currentKey) {
				console.error("[GeminiHandler] No current key available!")
				throw new Error(t("common:errors.gemini.no_available_keys"))
			}

			try {
				const client = this.createClient(currentKey)
				console.log(
					`[GeminiHandler] Executing operation with shuffled round-robin key ${currentKey.substring(0, 10)}...`,
				)
				const result = await operation(client, currentKey)

				console.log("[GeminiHandler] Operation successful!", {
					hadFailedKeys: this.keyManager.getFailedKeys().length > 0,
					usedShuffledRoundRobin: true,
				})

				// Success - reset failed keys if we had failures before
				if (this.keyManager.getFailedKeys().length > 0) {
					console.log("[GeminiHandler] Resetting failed keys after success")
					this.keyManager.resetFailedKeys()
				}

				// Move to next key for subsequent requests in this session
				this.keyManager.getNextKey()
				console.log("[GeminiHandler] Request completed successfully, advanced to next key for future requests")

				return result
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error))

				console.error(`[GeminiHandler] Operation failed:`, {
					error: lastError.message,
					keyPrefix: currentKey.substring(0, 10) + "...",
					attempt: attempt + 1,
					maxAttempts,
				})

				// Mark current key as failed and try next one
				this.keyManager.markKeyAsFailed(currentKey)

				console.warn(`Gemini API key failed (attempt ${attempt + 1}/${maxAttempts}):`, {
					error: lastError.message,
					keyPrefix: currentKey.substring(0, 10) + "...",
					availableKeys: this.keyManager.getAvailableKeys().length,
					failedKeys: this.keyManager.getFailedKeys().length,
				})

				// If this was the last attempt or no more keys available, throw
				if (attempt === maxAttempts - 1 || !this.keyManager.hasAvailableKeys()) {
					console.error("[GeminiHandler] No more attempts or keys available")
					break
				}

				// Move to next available key for retry
				this.keyManager.moveToNextAvailableKey()
				console.log("[GeminiHandler] Will try again with next available key from shuffled list")
			}
		}

		// All keys failed
		console.error("[GeminiHandler] All keys failed!")
		throw new Error(
			t("common:errors.gemini.all_keys_failed", {
				error: lastError?.message || "Unknown error",
				keyCount: this.keyManager.getKeyCount(),
			}),
		)
	}

	// kilocode_change start
	private async ensureModelsLoaded() {
		if (this.isVertex) {
			return
		}

		if (this.modelsLoaded) {
			return
		}

		if (!this.modelsLoading) {
			this.modelsLoading = this.loadModels().finally(() => {
				this.modelsLoaded = true
				this.modelsLoading = undefined
			})
		}

		await this.modelsLoading
	}

	private async loadModels() {
		try {
			this.models = await getGeminiModels({
				apiKey: this.options.geminiApiKey,
				baseUrl: this.options.googleGeminiBaseUrl,
			})
		} catch (error) {
			console.error("[GeminiHandler] Failed to fetch Gemini models", error)
			this.models = { ...geminiModels }
		}
	}
	// kilocode_change end

	async *createMessage(
		systemInstruction: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		await this.ensureModelsLoaded() // kilocode_change
		console.log("[GeminiHandler] createMessage called")

		// Shuffle keys at the start of this prompt session
		this.keyManager.shuffleKeys()
		console.log("[GeminiHandler] Keys shuffled for new prompt session")

		const { id: model, info, reasoning: thinkingConfig, maxTokens } = this.getModel()

		const contents = messages.map(convertAnthropicMessageToGemini)

		const tools: GenerateContentConfig["tools"] = []
		if (this.options.enableUrlContext) {
			tools.push({ urlContext: {} })
		}

		if (this.options.enableGrounding) {
			tools.push({ googleSearch: {} })
		}

		const config: GenerateContentConfig = {
			systemInstruction,
			httpOptions: this.options.googleGeminiBaseUrl ? { baseUrl: this.options.googleGeminiBaseUrl } : undefined,
			thinkingConfig,
			maxOutputTokens: this.options.modelMaxTokens ?? maxTokens ?? undefined,
			temperature: this.options.modelTemperature ?? 0,
			...(tools.length > 0 ? { tools } : {}),
		}

		const params: GenerateContentParameters = { model, contents, config }

		try {
			console.log("[GeminiHandler] Starting createMessage with model:", model)
			const result = await this.executeWithRetry(async (client, apiKey) => {
				console.log(`[GeminiHandler] Attempting generateContentStream with key: ${apiKey.substring(0, 10)}...`)
				return await client.models.generateContentStream(params)
			})

			console.log("[GeminiHandler] Successfully got stream result, processing chunks...")
			let lastUsageMetadata: GenerateContentResponseUsageMetadata | undefined
			let pendingGroundingMetadata: GroundingMetadata | undefined
			let hasContent = false // Track if we received any content
			let chunkCount = 0

			for await (const chunk of result) {
				chunkCount++
				console.log(`[GeminiHandler] Processing chunk ${chunkCount}:`, {
					hasCandidates: !!(chunk.candidates && chunk.candidates.length > 0),
					hasText: !!chunk.text,
					hasUsageMetadata: !!chunk.usageMetadata,
				})
				// Process candidates and their parts to separate thoughts from content
				if (chunk.candidates && chunk.candidates.length > 0) {
					const candidate = chunk.candidates[0]

					// // kilocode_change start
					// if (candidate.finishReason === FinishReason.MAX_TOKENS) {
					// 	throwMaxCompletionTokensReachedError()
					// }
					// // kilocode_change end

					if (candidate.groundingMetadata) {
						pendingGroundingMetadata = candidate.groundingMetadata
					}

					if (candidate.content && candidate.content.parts) {
						console.log(
							`[GeminiHandler] Processing ${candidate.content.parts.length} parts in chunk ${chunkCount}`,
						)
						for (const part of candidate.content.parts) {
							if (part.thought) {
								// This is a thinking/reasoning part
								if (part.text && part.text.trim()) {
									console.log(
										`[GeminiHandler] Yielding reasoning text: "${part.text.substring(0, 50)}${part.text.length > 50 ? "..." : ""}"`,
									)
									hasContent = true
									yield { type: "reasoning", text: part.text }
								} else {
									console.log(
										`[GeminiHandler] Skipping empty/whitespace reasoning part: "${part.text || "null"}"`,
									)
								}
							} else {
								// This is regular content
								if (part.text && part.text.trim()) {
									console.log(
										`[GeminiHandler] Yielding text content: "${part.text.substring(0, 50)}${part.text.length > 50 ? "..." : ""}"`,
									)
									hasContent = true
									yield { type: "text", text: part.text }
								} else {
									console.log(
										`[GeminiHandler] Skipping empty/whitespace content part: "${part.text || "null"}"`,
									)
								}
							}
						}
					}

					// Check for finish reason indicating potential rate limiting or blocked content
					if (candidate.finishReason) {
						const finishReason = candidate.finishReason
						console.log(`Gemini response finished with reason: ${finishReason}`)

						// Handle specific finish reasons that might indicate issues
						if (finishReason === FinishReason.RECITATION || finishReason === FinishReason.SAFETY) {
							console.warn("Gemini response blocked due to safety or recitation filters")
						} else if (finishReason === FinishReason.MAX_TOKENS) {
							console.warn("Gemini response truncated due to max token limit")
						}
					}
				}

				// Fallback to the original text property if no candidates structure
				else if (chunk.text && chunk.text.trim()) {
					hasContent = true
					yield { type: "text", text: chunk.text }
				}

				if (chunk.usageMetadata) {
					lastUsageMetadata = chunk.usageMetadata
				}
			}

			console.log(`[GeminiHandler] Finished processing ${chunkCount} chunks, hasContent:`, hasContent)

			// If no content was received, yield a minimal response to prevent "no assistant messages" error
			if (!hasContent) {
				console.warn("[GeminiHandler] No content received - yielding fallback response")
				const fallbackText =
					"I apologize, but I'm experiencing some technical difficulties at the moment. This might be due to API rate limits or temporary service issues. Please try again in a moment."
				console.log("[GeminiHandler] Yielding fallback text:", fallbackText)
				yield {
					type: "text",
					text: fallbackText,
				}
				console.log("[GeminiHandler] Fallback response yielded successfully")
			}

			if (pendingGroundingMetadata) {
				const sources = this.extractGroundingSources(pendingGroundingMetadata)
				if (sources.length > 0) {
					yield { type: "grounding", sources }
				}
			}

			if (lastUsageMetadata) {
				const inputTokens = lastUsageMetadata.promptTokenCount ?? 0
				const outputTokens = lastUsageMetadata.candidatesTokenCount ?? 0
				const cacheReadTokens = lastUsageMetadata.cachedContentTokenCount
				const reasoningTokens = lastUsageMetadata.thoughtsTokenCount

				yield {
					type: "usage",
					inputTokens,
					outputTokens,
					cacheReadTokens,
					reasoningTokens,
					totalCost: this.calculateCost({ info, inputTokens, outputTokens, cacheReadTokens }),
				}
			}
		} catch (error) {
			console.error("[GeminiHandler] Error in createMessage:", error)

			// Always provide fallback response when errors occur to prevent "no assistant messages" error
			const fallbackText =
				"I apologize, but I'm experiencing some technical difficulties at the moment. This might be due to API rate limits or temporary service issues. Please try again in a moment."
			console.log("[GeminiHandler] Error occurred, yielding fallback response:", fallbackText)

			yield {
				type: "text",
				text: fallbackText,
			}

			// Also provide usage metadata with 0 values to satisfy expectations
			yield {
				type: "usage",
				inputTokens: 0,
				outputTokens: 0,
				totalCost: 0,
			}

			// Note: We don't rethrow the error since we've provided a fallback response
			// The user gets a helpful message instead of a hard error
			console.log("[GeminiHandler] Fallback response provided instead of throwing error")
		}
	}

	override getModel() {
		// kilocode_change start: dynamic loading
		const requestedId = this.options.apiModelId
		const availableModels = this.models
		const staticModels = geminiModels as Record<string, ModelInfo>

		const id = requestedId && requestedId in availableModels ? requestedId : geminiDefaultModelId

		const info: ModelInfo =
			availableModels[id] ??
			staticModels[id] ??
			availableModels[geminiDefaultModelId] ??
			staticModels[geminiDefaultModelId]

		const params = getModelParams({ format: "gemini", modelId: id, model: info, settings: this.options })

		const apiModelId = id.endsWith(":thinking") ? id.replace(":thinking", "") : id

		return { id: apiModelId, info, ...params }
		// kilocode_change end
	}

	private extractGroundingSources(groundingMetadata?: GroundingMetadata): GroundingSource[] {
		const chunks = groundingMetadata?.groundingChunks

		if (!chunks) {
			return []
		}

		return chunks
			.map((chunk): GroundingSource | null => {
				const uri = chunk.web?.uri
				const title = chunk.web?.title || uri || "Unknown Source"

				if (uri) {
					return {
						title,
						url: uri,
					}
				}
				return null
			})
			.filter((source): source is GroundingSource => source !== null)
	}

	private extractCitationsOnly(groundingMetadata?: GroundingMetadata): string | null {
		const sources = this.extractGroundingSources(groundingMetadata)

		if (sources.length === 0) {
			return null
		}

		const citationLinks = sources.map((source, i) => `[${i + 1}](${source.url})`)
		return citationLinks.join(", ")
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			await this.ensureModelsLoaded() // kilocode_change
			// Shuffle keys at the start of this prompt session
			this.keyManager.shuffleKeys()
			console.log("[GeminiHandler] Keys shuffled for new prompt session")

			const { id: model } = this.getModel()

			const tools: GenerateContentConfig["tools"] = []
			if (this.options.enableUrlContext) {
				tools.push({ urlContext: {} })
			}
			if (this.options.enableGrounding) {
				tools.push({ googleSearch: {} })
			}
			const promptConfig: GenerateContentConfig = {
				httpOptions: this.options.googleGeminiBaseUrl
					? { baseUrl: this.options.googleGeminiBaseUrl }
					: undefined,
				temperature: this.options.modelTemperature ?? 0,
				...(tools.length > 0 ? { tools } : {}),
			}

			const result = await this.executeWithRetry(async (client) => {
				return await client.models.generateContent({
					model,
					contents: [{ role: "user", parts: [{ text: prompt }] }],
					config: promptConfig,
				})
			})

			let text = result.text ?? ""

			const candidate = result.candidates?.[0]
			if (candidate?.groundingMetadata) {
				const citations = this.extractCitationsOnly(candidate.groundingMetadata)
				if (citations) {
					text += `\n\n${t("common:errors.gemini.sources")} ${citations}`
				}
			}

			return text
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(t("common:errors.gemini.generate_complete_prompt", { error: error.message }))
			}

			throw error
		}
	}

	override async countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		try {
			await this.ensureModelsLoaded() // kilocode_change
			const { id: model } = this.getModel()

			const response = await this.executeWithRetry(async (client) => {
				return await client.models.countTokens({
					model,
					contents: convertAnthropicContentToGemini(content),
				})
			})

			if (response.totalTokens === undefined) {
				console.warn("Gemini token counting returned undefined, using fallback")
				return super.countTokens(content)
			}

			return response.totalTokens
		} catch (error) {
			console.warn("Gemini token counting failed, using fallback", error)
			return super.countTokens(content)
		}
	}

	public calculateCost({
		info,
		inputTokens,
		outputTokens,
		cacheReadTokens = 0,
	}: {
		info: ModelInfo
		inputTokens: number
		outputTokens: number
		cacheReadTokens?: number
	}) {
		// For models with tiered pricing, prices might only be defined in tiers
		let inputPrice = info.inputPrice
		let outputPrice = info.outputPrice
		let cacheReadsPrice = info.cacheReadsPrice

		// If there's tiered pricing then adjust the input and output token prices
		// based on the input tokens used.
		if (info.tiers) {
			const tier = info.tiers.find((tier) => inputTokens <= tier.contextWindow)

			if (tier) {
				inputPrice = tier.inputPrice ?? inputPrice
				outputPrice = tier.outputPrice ?? outputPrice
				cacheReadsPrice = tier.cacheReadsPrice ?? cacheReadsPrice
			}
		}

		// Check if we have the required prices after considering tiers
		if (!inputPrice || !outputPrice) {
			return undefined
		}

		// cacheReadsPrice is optional - if not defined, treat as 0
		if (!cacheReadsPrice) {
			cacheReadsPrice = 0
		}

		// Subtract the cached input tokens from the total input tokens.
		const uncachedInputTokens = inputTokens - cacheReadTokens

		let cacheReadCost = cacheReadTokens > 0 ? cacheReadsPrice * (cacheReadTokens / 1_000_000) : 0

		const inputTokensCost = inputPrice * (uncachedInputTokens / 1_000_000)
		const outputTokensCost = outputPrice * (outputTokens / 1_000_000)
		const totalCost = inputTokensCost + outputTokensCost + cacheReadCost

		const trace: Record<string, { price: number; tokens: number; cost: number }> = {
			input: { price: inputPrice, tokens: uncachedInputTokens, cost: inputTokensCost },
			output: { price: outputPrice, tokens: outputTokens, cost: outputTokensCost },
		}

		if (cacheReadTokens > 0) {
			trace.cacheRead = { price: cacheReadsPrice, tokens: cacheReadTokens, cost: cacheReadCost }
		}

		// console.log(`[GeminiHandler] calculateCost -> ${totalCost}`, trace)

		return totalCost
	}
}
