import { useCallback, useState } from "react"
import { Checkbox } from "vscrui"
import { VSCodeTextField, VSCodeTextArea } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type GeminiProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	fromWelcomeView?: boolean
}

export const Gemini = ({ apiConfiguration, setApiConfigurationField, fromWelcomeView }: GeminiProps) => {
	const { t } = useAppTranslation()

	const [googleGeminiBaseUrlSelected, setGoogleGeminiBaseUrlSelected] = useState(
		!!apiConfiguration?.googleGeminiBaseUrl,
	)
	
	// Multiple keys mode state - default to true if geminiApiKeys is configured
	const [useMultipleKeys, setUseMultipleKeys] = useState(
		!!(apiConfiguration?.geminiApiKeys && apiConfiguration?.geminiApiKeys.trim())
	)

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	return (
		<>
			{/* Multiple keys mode toggle */}
			<div className="mb-4">
				<Checkbox
					checked={useMultipleKeys}
					onChange={(checked: boolean) => {
						setUseMultipleKeys(checked)
						if (checked) {
							// Migrate single key to multiple keys format
							const singleKey = apiConfiguration?.geminiApiKey
							if (singleKey && singleKey.trim()) {
								setApiConfigurationField("geminiApiKeys", singleKey)
								setApiConfigurationField("geminiApiKey", "")
							}
						} else {
							// Migrate back to single key (use first key if available)
							const multiKeys = apiConfiguration?.geminiApiKeys
							if (multiKeys && multiKeys.trim()) {
								const keys = multiKeys.split(/\r?\n/).map(k => k.trim()).filter(k => k.length > 0)
								if (keys.length > 0) {
									setApiConfigurationField("geminiApiKey", keys[0])
								}
							}
							setApiConfigurationField("geminiApiKeys", "")
						}
					}}>
					{t("settings:providers.gemini.useMultipleApiKeys")}
				</Checkbox>
				<div className="text-sm text-vscode-descriptionForeground mt-1">
					{t("settings:providers.gemini.multipleApiKeysDescription")}
				</div>
			</div>

			{/* API Key Input */}
			{useMultipleKeys ? (
				<>
					<VSCodeTextArea
						value={apiConfiguration?.geminiApiKeys || ""}
						onInput={handleInputChange("geminiApiKeys")}
						placeholder={t("settings:providers.gemini.multipleApiKeysPlaceholder")}
						className="w-full"
						rows={4}>
						<label className="block font-medium mb-1">{t("settings:providers.gemini.multipleApiKeysLabel")}</label>
					</VSCodeTextArea>
					<div className="text-sm text-vscode-descriptionForeground -mt-2">
						{t("settings:providers.gemini.multipleApiKeysInstructions")}
					</div>
				</>
			) : (
				<>
					<VSCodeTextField
						value={apiConfiguration?.geminiApiKey || ""}
						type="password"
						onInput={handleInputChange("geminiApiKey")}
						placeholder={t("settings:placeholders.apiKey")}
						className="w-full">
						<label className="block font-medium mb-1">{t("settings:providers.geminiApiKey")}</label>
					</VSCodeTextField>
					<div className="text-sm text-vscode-descriptionForeground -mt-2">
						{t("settings:providers.apiKeyStorageNotice")}
					</div>
				</>
			)}

			{/* Get API key link */}
			{((useMultipleKeys && !apiConfiguration?.geminiApiKeys) || (!useMultipleKeys && !apiConfiguration?.geminiApiKey)) && (
				<VSCodeButtonLink href="https://ai.google.dev/" appearance="secondary">
					{t("settings:providers.getGeminiApiKey")}
				</VSCodeButtonLink>
			)}

			<div>
				<Checkbox
					data-testid="checkbox-custom-base-url"
					checked={googleGeminiBaseUrlSelected}
					onChange={(checked: boolean) => {
						setGoogleGeminiBaseUrlSelected(checked)
						if (!checked) {
							setApiConfigurationField("googleGeminiBaseUrl", "")
						}
					}}>
					{t("settings:providers.useCustomBaseUrl")}
				</Checkbox>
				{googleGeminiBaseUrlSelected && (
					<VSCodeTextField
						value={apiConfiguration?.googleGeminiBaseUrl || ""}
						type="url"
						onInput={handleInputChange("googleGeminiBaseUrl")}
						placeholder={t("settings:defaults.geminiUrl")}
						className="w-full mt-1"
					/>
				)}

				{!fromWelcomeView && (
					<>
						<Checkbox
							className="mt-6"
							data-testid="checkbox-url-context"
							checked={!!apiConfiguration.enableUrlContext}
							onChange={(checked: boolean) => setApiConfigurationField("enableUrlContext", checked)}>
							{t("settings:providers.geminiParameters.urlContext.title")}
						</Checkbox>
						<div className="text-sm text-vscode-descriptionForeground mb-3 mt-1.5">
							{t("settings:providers.geminiParameters.urlContext.description")}
						</div>

						<Checkbox
							data-testid="checkbox-grounding-search"
							checked={!!apiConfiguration.enableGrounding}
							onChange={(checked: boolean) => setApiConfigurationField("enableGrounding", checked)}>
							{t("settings:providers.geminiParameters.groundingSearch.title")}
						</Checkbox>
						<div className="text-sm text-vscode-descriptionForeground mb-3 mt-1.5">
							{t("settings:providers.geminiParameters.groundingSearch.description")}
						</div>
					</>
				)}
			</div>
		</>
	)
}
