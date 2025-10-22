import { applyDiffTool } from "../../multiApplyDiffTool"
import { EXPERIMENT_IDS } from "../../../../shared/experiments"

// Mock the applyDiffTool module
vi.mock("../../applyDiffTool", () => ({
	applyDiffToolLegacy: vi.fn(),
}))

// Import after mocking to get the mocked version
import { applyDiffToolLegacy } from "../../applyDiffTool"

describe("applyDiffTool experiment routing - JSON toolStyle", () => {
	let mockCline: any
	let mockBlock: any
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any
	let mockProvider: any

	beforeEach(() => {
		vi.clearAllMocks()

		mockProvider = {
			getState: vi.fn(),
		}

		mockCline = {
			providerRef: {
				deref: vi.fn().mockReturnValue(mockProvider),
			},
			cwd: "/test",
			apiConfiguration: {
				toolStyle: "json",
			},
			diffStrategy: {
				applyDiff: vi.fn(),
				getProgressStatus: vi.fn(),
			},
			diffViewProvider: {
				reset: vi.fn(),
			},
			api: {
				getModel: vi.fn().mockReturnValue({ id: "test-model" }),
			},
			processQueuedMessages: vi.fn(),
		} as any

		mockBlock = {
			params: {
				files: [
					{
						path: "test.ts",
						diffs: [
							{
								content: "test diff",
								start_line: 1,
							},
						],
					},
				],
			},
			partial: false,
		}

		mockAskApproval = vi.fn()
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn((tag, value) => value)
	})

	it("should use new tool when MULTI_FILE_APPLY_DIFF experiment is enabled", async () => {
		mockProvider.getState.mockResolvedValue({
			experiments: {
				[EXPERIMENT_IDS.MULTI_FILE_APPLY_DIFF]: true,
			},
		})

		// Mock the new tool behavior - it should continue with the new implementation
		// Since we're not mocking the entire function, we'll just verify it doesn't call legacy
		await applyDiffTool(
			mockCline,
			mockBlock,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(applyDiffToolLegacy).not.toHaveBeenCalled()
	})

	it("should use new tool when provider is not available", async () => {
		mockCline.providerRef.deref.mockReturnValue(null)

		await applyDiffTool(
			mockCline,
			mockBlock,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		// When provider is null, it should continue with new implementation (not call legacy)
		expect(applyDiffToolLegacy).not.toHaveBeenCalled()
	})
})
