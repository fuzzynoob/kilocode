import type { ProviderName } from "../../types/messages.js"

/**
 * Configuration map for provider validation requirements.
 * Maps each provider to its required fields that must be non-empty when selected.
 */
export const PROVIDER_REQUIRED_FIELDS: Record<ProviderName, string[]> = {
	kilocode: ["kilocodeToken", "kilocodeModel"],
	anthropic: ["apiKey", "apiModelId"],
	"openai-native": ["openAiNativeApiKey", "apiModelId"],
	openrouter: ["openRouterApiKey", "openRouterModelId"],
	ollama: ["ollamaBaseUrl", "ollamaModelId"],
	lmstudio: ["lmStudioBaseUrl", "lmStudioModelId"],
	bedrock: ["awsAccessKey", "awsSecretKey", "awsRegion", "apiModelId"],
	gemini: ["geminiApiKey", "apiModelId"],
	"claude-code": ["claudeCodePath", "apiModelId"],
	mistral: ["mistralApiKey", "apiModelId"],
	groq: ["groqApiKey", "apiModelId"],
	deepseek: ["deepSeekApiKey", "apiModelId"],
	xai: ["xaiApiKey", "apiModelId"],
	openai: ["openAiApiKey"],
	cerebras: ["cerebrasApiKey", "apiModelId"],
	glama: ["glamaApiKey", "glamaModelId"],
	huggingface: ["huggingFaceApiKey", "huggingFaceModelId", "huggingFaceInferenceProvider"],
	litellm: ["litellmBaseUrl", "litellmApiKey", "litellmModelId"],
	moonshot: ["moonshotBaseUrl", "moonshotApiKey", "apiModelId"],
	doubao: ["doubaoApiKey", "apiModelId"],
	chutes: ["chutesApiKey", "apiModelId"],
	sambanova: ["sambaNovaApiKey", "apiModelId"],
	fireworks: ["fireworksApiKey", "apiModelId"],
	featherless: ["featherlessApiKey", "apiModelId"],
	deepinfra: ["deepInfraApiKey", "deepInfraModelId"],
	"io-intelligence": ["ioIntelligenceApiKey", "ioIntelligenceModelId"],
	"qwen-code": ["qwenCodeOauthPath", "apiModelId"],
	"gemini-cli": ["geminiCliOAuthPath", "geminiCliProjectId", "apiModelId"],
	zai: ["zaiApiKey", "zaiApiLine", "apiModelId"],
	unbound: ["unboundApiKey", "unboundModelId"],
	requesty: ["requestyApiKey", "requestyModelId"],
	roo: ["apiModelId"],
	"vercel-ai-gateway": ["vercelAiGatewayApiKey", "vercelAiGatewayModelId"],
	"human-relay": ["apiModelId"],
	"fake-ai": ["apiModelId"],
	// Special cases handled separately in handleSpecialValidations
	vertex: [], // Has special validation logic (either/or fields)
	"vscode-lm": [], // Has nested object validation
	"virtual-quota-fallback": [], // Has array validation
}
