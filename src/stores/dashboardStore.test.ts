import type { ScanResult } from "../types";
import { useDashboardStore } from "./dashboardStore";

jest.mock("../services/storageService", () => ({
  insertActedSuggestion: jest.fn().mockResolvedValue(undefined),
  getActedSuggestionIds: jest.fn().mockResolvedValue(new Set<string>()),
}));

import {
  getActedSuggestionIds,
  insertActedSuggestion,
} from "../services/storageService";

const mockInsertActedSuggestion =
  insertActedSuggestion as jest.MockedFunction<typeof insertActedSuggestion>;
const mockGetActedSuggestionIds =
  getActedSuggestionIds as jest.MockedFunction<typeof getActedSuggestionIds>;

function makeScan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    id: "scan-1",
    timestamp: 100,
    classification: "SAFE",
    confidence: 80,
    messagePreview: "hello",
    redFlags: [],
    suggestedActions: [],
    explanation: "fine",
    ...overrides,
  };
}

beforeEach(() => {
  useDashboardStore.setState({
    suggestions: [],
    scannedMessages: [],
    activeBreachesCount: 0,
    protectedImagesCount: 0,
  });
});

describe("dashboardStore markSuggestionAsDone", () => {
  it("persists the acted suggestion id through insertActedSuggestion", () => {
    useDashboardStore.setState({
      suggestions: [
        {
          id: "scan-scan-1-0",
          text: "Change password",
          acted: false,
          isFallback: false,
          source: "scan",
          sourceId: "scan-1",
        },
      ],
    });

    useDashboardStore.getState().markSuggestionAsDone("scan-scan-1-0");

    expect(mockInsertActedSuggestion).toHaveBeenCalledWith("scan-scan-1-0");
    expect(
      useDashboardStore.getState().suggestions.find(
        (suggestion) => suggestion.id === "scan-scan-1-0"
      )?.acted
    ).toBe(true);
  });

  it("does not persist fallback suggestions", () => {
    useDashboardStore.setState({
      suggestions: [
        {
          id: "scan-scan-1-0",
          text: "Retry later",
          acted: false,
          isFallback: true,
          source: "scan",
          sourceId: "scan-1",
        },
      ],
    });

    useDashboardStore.getState().markSuggestionAsDone("scan-scan-1-0");

    expect(mockInsertActedSuggestion).not.toHaveBeenCalled();
  });
});

describe("dashboardStore hydrateScanHistory", () => {
  it("restores acted: true for suggestion ids present in the persisted set", async () => {
    mockGetActedSuggestionIds.mockResolvedValue(new Set(["scan-scan-1-0"]));

    await useDashboardStore.getState().hydrateScanHistory([
      makeScan({
        id: "scan-1",
        classification: "PHISHING",
        suggestedActions: ["Change password", "Enable 2FA"],
      }),
    ]);

    const suggestions = useDashboardStore.getState().suggestions;
    expect(suggestions).toEqual([
      expect.objectContaining({ id: "scan-scan-1-0", acted: true }),
      expect.objectContaining({ id: "scan-scan-1-1", acted: false }),
    ]);
  });

  it("defaults to acted: false when the persisted set does not contain the id", async () => {
    mockGetActedSuggestionIds.mockResolvedValue(new Set(["some-other-id"]));

    await useDashboardStore.getState().hydrateScanHistory([
      makeScan({
        id: "scan-1",
        classification: "PHISHING",
        suggestedActions: ["Change password"],
      }),
    ]);

    expect(useDashboardStore.getState().suggestions).toEqual([
      expect.objectContaining({ id: "scan-scan-1-0", acted: false }),
    ]);
  });

  it("falls back to an empty acted set when the persisted lookup rejects", async () => {
    mockGetActedSuggestionIds.mockRejectedValue(new Error("db not ready"));

    await expect(
      useDashboardStore.getState().hydrateScanHistory([
        makeScan({
          id: "scan-1",
          classification: "PHISHING",
          suggestedActions: ["Change password"],
        }),
      ])
    ).resolves.toBeUndefined();

    expect(useDashboardStore.getState().suggestions).toEqual([
      expect.objectContaining({ id: "scan-scan-1-0", acted: false }),
    ]);
  });
});
