import { describe, expect, it } from "vitest"
import { GeminiKeyManager } from "../gemini-key-manager"

describe("GeminiKeyManager", () => {
	describe("constructor", () => {
		it("should handle string input with multiple keys", () => {
			const keys = "key1\nkey2\nkey3"
			const manager = new GeminiKeyManager(keys)
			
			expect(manager.getAllKeys()).toEqual(["key1", "key2", "key3"])
			expect(manager.getKeyCount()).toBe(3)
		})

		it("should handle array input", () => {
			const keys = ["key1", "key2", "key3"]
			const manager = new GeminiKeyManager(keys)
			
			expect(manager.getAllKeys()).toEqual(["key1", "key2", "key3"])
			expect(manager.getKeyCount()).toBe(3)
		})

		it("should filter out empty lines", () => {
			const keys = "key1\n\n  \nkey2\n\nkey3\n"
			const manager = new GeminiKeyManager(keys)
			
			expect(manager.getAllKeys()).toEqual(["key1", "key2", "key3"])
			expect(manager.getKeyCount()).toBe(3)
		})

		it("should handle empty input", () => {
			const manager = new GeminiKeyManager()
			
			expect(manager.getAllKeys()).toEqual([])
			expect(manager.getKeyCount()).toBe(0)
			expect(manager.isConfigured()).toBe(false)
		})
	})

	describe("round-robin rotation", () => {
		it("should rotate through keys", () => {
			const keys = ["key1", "key2", "key3"]
			const manager = new GeminiKeyManager(keys)
			
			expect(manager.getCurrentKey()).toBe("key1")
			expect(manager.getNextKey()).toBe("key2")
			expect(manager.getCurrentKey()).toBe("key2")
			expect(manager.getNextKey()).toBe("key3")
			expect(manager.getCurrentKey()).toBe("key3")
			expect(manager.getNextKey()).toBe("key1") // Should wrap around
		})

		it("should handle single key", () => {
			const manager = new GeminiKeyManager(["single-key"])
			
			expect(manager.getCurrentKey()).toBe("single-key")
			expect(manager.getNextKey()).toBe("single-key")
			expect(manager.getCurrentKey()).toBe("single-key")
		})
	})

	describe("failed key management", () => {
		it("should skip failed keys", () => {
			const keys = ["key1", "key2", "key3"]
			const manager = new GeminiKeyManager(keys)
			
			// Mark key1 as failed
			manager.markKeyAsFailed("key1")
			
			expect(manager.getCurrentKey()).toBe("key2") // Should skip key1
			expect(manager.getAvailableKeys()).toEqual(["key2", "key3"])
			expect(manager.getFailedKeys()).toEqual(["key1"])
		})

		it("should reset failed keys when all keys fail", () => {
			const keys = ["key1", "key2"]
			const manager = new GeminiKeyManager(keys)
			
			// Mark all keys as failed
			manager.markKeyAsFailed("key1")
			manager.markKeyAsFailed("key2")
			
			// Should reset and return first key
			expect(manager.getCurrentKey()).toBe("key1")
			expect(manager.getFailedKeys()).toEqual([])
		})

		it("should reset failed keys manually", () => {
			const keys = ["key1", "key2", "key3"]
			const manager = new GeminiKeyManager(keys)
			
			manager.markKeyAsFailed("key1")
			manager.markKeyAsFailed("key2")
			
			expect(manager.getFailedKeys()).toEqual(["key1", "key2"])
			
			manager.resetFailedKeys()
			
			expect(manager.getFailedKeys()).toEqual([])
			expect(manager.getAvailableKeys()).toEqual(["key1", "key2", "key3"])
		})
	})

	describe("key management operations", () => {
		it("should add new keys", () => {
			const manager = new GeminiKeyManager(["key1"])
			
			manager.addKey("key2")
			manager.addKey("key3")
			
			expect(manager.getAllKeys()).toEqual(["key1", "key2", "key3"])
		})

		it("should not add duplicate keys", () => {
			const manager = new GeminiKeyManager(["key1"])
			
			manager.addKey("key1") // Duplicate
			manager.addKey("key2")
			
			expect(manager.getAllKeys()).toEqual(["key1", "key2"])
		})

		it("should remove keys", () => {
			const manager = new GeminiKeyManager(["key1", "key2", "key3"])
			
			const removed = manager.removeKey("key2")
			
			expect(removed).toBe(true)
			expect(manager.getAllKeys()).toEqual(["key1", "key3"])
		})

		it("should handle removing non-existent key", () => {
			const manager = new GeminiKeyManager(["key1", "key2"])
			
			const removed = manager.removeKey("key3")
			
			expect(removed).toBe(false)
			expect(manager.getAllKeys()).toEqual(["key1", "key2"])
		})
	})

	describe("static methods", () => {
		it("should create from single key", () => {
			const manager = GeminiKeyManager.fromSingleKey("single-key")
			
			expect(manager.getAllKeys()).toEqual(["single-key"])
			expect(manager.isConfigured()).toBe(true)
		})

		it("should handle undefined single key", () => {
			const manager = GeminiKeyManager.fromSingleKey(undefined)
			
			expect(manager.getAllKeys()).toEqual([])
			expect(manager.isConfigured()).toBe(false)
		})
	})

	describe("update keys", () => {
		it("should update with string input", () => {
			const manager = new GeminiKeyManager(["old-key"])
			
			manager.updateKeys("new-key1\nnew-key2")
			
			expect(manager.getAllKeys()).toEqual(["new-key1", "new-key2"])
			expect(manager.getFailedKeys()).toEqual([]) // Should reset failed keys
		})

		it("should update with array input", () => {
			const manager = new GeminiKeyManager(["old-key"])
			
			manager.updateKeys(["new-key1", "new-key2"])
			
			expect(manager.getAllKeys()).toEqual(["new-key1", "new-key2"])
		})
	})
})

