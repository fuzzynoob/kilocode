/**
 * Manages multiple Gemini API keys with round-robin rotation and fallback logic
 */
export class GeminiKeyManager {
	private keys: string[]
	private currentIndex: number = 0
	private failedKeys: Set<string> = new Set()
	private readonly maxRetries: number = 3

	constructor(keysInput?: string | string[]) {
		if (typeof keysInput === "string") {
			// Parse newline-separated keys, filter out empty lines and trim whitespace
			this.keys = keysInput
				.split(/\r?\n/)
				.map((key) => key.trim())
				.filter((key) => key.length > 0)
		} else if (Array.isArray(keysInput)) {
			this.keys = keysInput.filter((key) => key && key.trim().length > 0)
		} else {
			this.keys = []
		}
	}

	/**
	 * Get the current API key using round-robin rotation
	 */
	getCurrentKey(): string | null {
		if (this.keys.length === 0) {
			return null
		}

		// Find the next available key that hasn't failed
		const availableKeys = this.keys.filter((key) => !this.failedKeys.has(key))

		if (availableKeys.length === 0) {
			// All keys have failed, reset failed keys and start over
			this.failedKeys.clear()
			this.currentIndex = 0
			return this.keys[0] || null
		}

		// Find next available key starting from current index
		let attempts = 0
		while (attempts < this.keys.length) {
			const key = this.keys[this.currentIndex]

			if (!this.failedKeys.has(key)) {
				// Key found - return it without incrementing index
				// The index will be incremented when getNextKey() is called
				return key
			}

			this.currentIndex = (this.currentIndex + 1) % this.keys.length
			attempts++
		}

		// Fallback - shouldn't reach here but return first available key
		return availableKeys[0] || null
	}

	/**
	 * Randomize the order of keys (called at the start of a prompt session)
	 * This shuffles the available keys and resets the current index
	 */
	shuffleKeys(): void {
		if (this.keys.length <= 1) {
			return
		}

		// Get available keys (non-failed)
		const availableKeys = this.keys.filter((key) => !this.failedKeys.has(key))
		const failedKeys = this.keys.filter((key) => this.failedKeys.has(key))

		if (availableKeys.length === 0) {
			// All keys have failed, reset failed keys and shuffle all
			this.failedKeys.clear()
			this.shuffleArray(this.keys)
		} else {
			// Shuffle only available keys, then append failed keys at the end
			this.shuffleArray(availableKeys)
			this.keys = [...availableKeys, ...failedKeys]
		}

		// Reset index to start from the beginning of shuffled list
		this.currentIndex = 0
	}

	/**
	 * Fisher-Yates shuffle algorithm to randomize array in place
	 */
	private shuffleArray(array: string[]): void {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1))
			;[array[i], array[j]] = [array[j], array[i]]
		}
	}

	/**
	 * Get the next API key in rotation
	 */
	getNextKey(): string | null {
		if (this.keys.length === 0) {
			return null
		}

		// Move to next key and return it
		this.currentIndex = (this.currentIndex + 1) % this.keys.length
		return this.getCurrentKey()
	}

	/**
	 * Force move to next available key (used when current key fails)
	 */
	moveToNextAvailableKey(): string | null {
		if (this.keys.length === 0) {
			return null
		}

		const availableKeys = this.keys.filter((key) => !this.failedKeys.has(key))

		if (availableKeys.length === 0) {
			// All keys have failed, reset and start over
			this.failedKeys.clear()
			this.currentIndex = 0
			return this.keys[0] || null
		}

		// Find next available key
		let attempts = 0
		while (attempts < this.keys.length) {
			this.currentIndex = (this.currentIndex + 1) % this.keys.length
			const key = this.keys[this.currentIndex]

			if (!this.failedKeys.has(key)) {
				return key
			}

			attempts++
		}

		// Should not reach here, but fallback to first available
		return availableKeys[0] || null
	}

	/**
	 * Mark a key as failed (temporarily remove from rotation)
	 */
	markKeyAsFailed(key: string): void {
		if (this.keys.includes(key)) {
			this.failedKeys.add(key)
		}
	}

	/**
	 * Reset failed keys (clear failure state)
	 */
	resetFailedKeys(): void {
		this.failedKeys.clear()
	}

	/**
	 * Get all available (non-failed) keys
	 */
	getAvailableKeys(): string[] {
		return this.keys.filter((key) => !this.failedKeys.has(key))
	}

	/**
	 * Get all configured keys
	 */
	getAllKeys(): string[] {
		return [...this.keys]
	}

	/**
	 * Get failed keys
	 */
	getFailedKeys(): string[] {
		return this.keys.filter((key) => this.failedKeys.has(key))
	}

	/**
	 * Check if there are any available keys
	 */
	hasAvailableKeys(): boolean {
		return this.getAvailableKeys().length > 0
	}

	/**
	 * Get the total number of keys
	 */
	getKeyCount(): number {
		return this.keys.length
	}

	/**
	 * Add a new key to the pool
	 */
	addKey(key: string): void {
		const trimmedKey = key.trim()
		if (trimmedKey.length > 0 && !this.keys.includes(trimmedKey)) {
			this.keys.push(trimmedKey)
		}
	}

	/**
	 * Remove a key from the pool
	 */
	removeKey(key: string): boolean {
		const index = this.keys.indexOf(key)
		if (index !== -1) {
			this.keys.splice(index, 1)
			this.failedKeys.delete(key)

			// Adjust currentIndex if necessary
			if (this.currentIndex >= this.keys.length && this.keys.length > 0) {
				this.currentIndex = 0
			}
			return true
		}
		return false
	}

	/**
	 * Update the entire key pool
	 */
	updateKeys(keysInput?: string | string[]): void {
		if (typeof keysInput === "string") {
			this.keys = keysInput
				.split(/\r?\n/)
				.map((key) => key.trim())
				.filter((key) => key.length > 0)
		} else if (Array.isArray(keysInput)) {
			this.keys = keysInput.filter((key) => key && key.trim().length > 0)
		} else {
			this.keys = []
		}

		// Reset state
		this.currentIndex = 0
		this.failedKeys.clear()
	}

	/**
	 * Migration helper: convert single key to multi-key format
	 */
	static fromSingleKey(singleKey?: string): GeminiKeyManager {
		return new GeminiKeyManager(singleKey ? [singleKey] : undefined)
	}

	/**
	 * Check if the manager is configured with keys
	 */
	isConfigured(): boolean {
		return this.keys.length > 0
	}
}
