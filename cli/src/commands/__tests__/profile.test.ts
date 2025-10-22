/**
 * Tests for the /profile command
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { profileCommand } from "../profile.js"
import type { CommandContext } from "../core/types.js"

describe("/profile command", () => {
	let mockContext: CommandContext
	let addMessageMock: ReturnType<typeof vi.fn>

	beforeEach(() => {
		addMessageMock = vi.fn()

		mockContext = {
			input: "/profile",
			args: [],
			options: {},
			sendMessage: vi.fn().mockResolvedValue(undefined),
			addMessage: addMessageMock,
			clearMessages: vi.fn(),
			replaceMessages: vi.fn(),
			clearTask: vi.fn().mockResolvedValue(undefined),
			setMode: vi.fn(),
			exit: vi.fn(),
			routerModels: null,
			currentProvider: {
				id: "test-provider",
				provider: "kilocode",
				kilocodeToken: "test-token",
			},
			kilocodeDefaultModel: "test-model",
			updateProviderModel: vi.fn().mockResolvedValue(undefined),
			refreshRouterModels: vi.fn().mockResolvedValue(undefined),
			updateProvider: vi.fn().mockResolvedValue(undefined),
			profileData: null,
			balanceData: null,
			profileLoading: false,
			balanceLoading: false,
		}
	})

	describe("Command metadata", () => {
		it("should have correct name", () => {
			expect(profileCommand.name).toBe("profile")
		})

		it("should have correct aliases", () => {
			expect(profileCommand.aliases).toEqual(["me", "whoami"])
		})

		it("should have correct description", () => {
			expect(profileCommand.description).toBe("View your Kilocode profile information")
		})

		it("should have correct category", () => {
			expect(profileCommand.category).toBe("settings")
		})

		it("should have correct priority", () => {
			expect(profileCommand.priority).toBe(9)
		})

		it("should have correct usage", () => {
			expect(profileCommand.usage).toBe("/profile")
		})

		it("should have examples", () => {
			expect(profileCommand.examples).toContain("/profile")
		})
	})

	describe("Authentication check", () => {
		it("should show error when not using Kilocode provider", async () => {
			mockContext.currentProvider = {
				id: "test-provider",
				provider: "anthropic",
			}

			await profileCommand.handler(mockContext)

			expect(addMessageMock).toHaveBeenCalledTimes(1)
			const message = addMessageMock.mock.calls[0][0]
			expect(message.type).toBe("error")
			expect(message.content).toContain("Profile command requires Kilocode provider")
		})

		it("should show error when not authenticated", async () => {
			mockContext.currentProvider = {
				id: "test-provider",
				provider: "kilocode",
			}

			await profileCommand.handler(mockContext)

			expect(addMessageMock).toHaveBeenCalledTimes(1)
			const message = addMessageMock.mock.calls[0][0]
			expect(message.type).toBe("error")
			expect(message.content).toContain("Not authenticated")
		})
	})

	describe("Profile display", () => {
		it("should show loading message when profile is loading", async () => {
			mockContext.currentProvider = {
				id: "test-provider",
				provider: "kilocode",
				kilocodeToken: "test-token",
			}
			mockContext.profileLoading = true

			await profileCommand.handler(mockContext)

			expect(addMessageMock).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "system",
					content: "Loading profile information...",
				}),
			)
		})

		it("should display profile information when loaded", async () => {
			mockContext.currentProvider = {
				id: "test-provider",
				provider: "kilocode",
				kilocodeToken: "test-token",
			}
			mockContext.profileData = {
				user: {
					name: "John Doe",
					email: "john@example.com",
				},
				organizations: [],
			}
			mockContext.balanceData = {
				balance: 42.75,
			}
			mockContext.profileLoading = false
			mockContext.balanceLoading = false

			await profileCommand.handler(mockContext)

			const profileMessage = addMessageMock.mock.calls.find((call: any) =>
				call[0].content?.includes("Profile Information"),
			)
			expect(profileMessage).toBeDefined()
			if (profileMessage) {
				expect(profileMessage[0].content).toContain("John Doe")
				expect(profileMessage[0].content).toContain("john@example.com")
				expect(profileMessage[0].content).toContain("$42.75")
			}
		})

		it("should show Personal when no organization is set", async () => {
			mockContext.currentProvider = {
				id: "test-provider",
				provider: "kilocode",
				kilocodeToken: "test-token",
			}
			mockContext.profileData = {
				user: {
					name: "Test User",
					email: "test@example.com",
				},
				organizations: [],
			}
			mockContext.balanceData = {
				balance: 10.0,
			}
			mockContext.profileLoading = false
			mockContext.balanceLoading = false

			await profileCommand.handler(mockContext)

			const profileMessage = addMessageMock.mock.calls.find((call: any) =>
				call[0].content?.includes("Profile Information"),
			)
			expect(profileMessage).toBeDefined()
			if (profileMessage) {
				expect(profileMessage[0].content).toContain("Teams: Personal")
			}
		})

		it("should show organization name when set", async () => {
			mockContext.currentProvider = {
				id: "test-provider",
				provider: "kilocode",
				kilocodeToken: "test-token",
				kilocodeOrganizationId: "org-123",
			}
			mockContext.profileData = {
				user: {
					name: "Test User",
					email: "test@example.com",
				},
				organizations: [
					{
						id: "org-123",
						name: "Acme Corp",
						role: "admin",
					},
				],
			}
			mockContext.balanceData = {
				balance: 100.0,
			}
			mockContext.profileLoading = false
			mockContext.balanceLoading = false

			await profileCommand.handler(mockContext)

			const profileMessage = addMessageMock.mock.calls.find((call: any) =>
				call[0].content?.includes("Profile Information"),
			)
			expect(profileMessage).toBeDefined()
			if (profileMessage) {
				expect(profileMessage[0].content).toContain("Teams: Acme Corp (admin)")
			}
		})
	})

	describe("Error handling", () => {
		it("should handle missing user data", async () => {
			mockContext.currentProvider = {
				id: "test-provider",
				provider: "kilocode",
				kilocodeToken: "test-token",
			}
			mockContext.profileData = {
				organizations: [],
			}
			mockContext.balanceData = {
				balance: 10.0,
			}
			mockContext.profileLoading = false
			mockContext.balanceLoading = false

			await profileCommand.handler(mockContext)

			const errorMessage = addMessageMock.mock.calls.find(
				(call: any) => call[0].type === "error" && call[0].content?.includes("No user data available"),
			)
			expect(errorMessage).toBeDefined()
		})
	})
})
