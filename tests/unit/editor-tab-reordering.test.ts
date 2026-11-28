import { beforeEach, describe, expect, it } from "vitest";

import { Id } from "@/../convex/_generated/dataModel";
import { useEditorStore } from "@/features/editor/store/use-editor-store";

const projectId = "project_reorder" as Id<"projects">;
const fileA = "file_a" as Id<"files">;
const fileB = "file_b" as Id<"files">;
const fileC = "file_c" as Id<"files">;

const store = useEditorStore;

function openFixtureTabs() {
  store.getState().openFile(projectId, fileA, { pinned: true, initialContent: "A" });
  store.getState().openFile(projectId, fileB, { pinned: true, initialContent: "B" });
  store.getState().openFile(projectId, fileC, { pinned: false, initialContent: "C" });
}

describe("editor tab reordering (Issue #138)", () => {
  beforeEach(() => {
    store.setState({ tabs: new Map() });
    openFixtureTabs();
  });

  it("moves a tab left by inserting it before its previous neighbor", () => {
    store.getState().reorderTabs(projectId, fileC, fileB, "before");

    expect(store.getState().getTabState(projectId).openTabs).toEqual([fileA, fileC, fileB]);
  });

  it("moves a tab right by inserting it after its next neighbor", () => {
    store.getState().reorderTabs(projectId, fileA, fileB, "after");

    expect(store.getState().getTabState(projectId).openTabs).toEqual([fileB, fileA, fileC]);
  });

  it("keeps the order unchanged for cancelled or invalid reorders", () => {
    const before = store.getState().getTabState(projectId).openTabs;

    store.getState().reorderTabs(projectId, fileA, fileA, "after");
    store.getState().reorderTabs(projectId, fileA, "missing" as Id<"files">, "before");
    store.getState().reorderTabs(projectId, "missing" as Id<"files">, fileB, "after");

    expect(store.getState().getTabState(projectId).openTabs).toEqual(before);
  });

  it("preserves active, preview, dirty, saving, and conflict state by file ID", () => {
    store.getState().updateBuffer(projectId, fileA, "A edited");
    store.getState().markSavingStart(projectId, fileB);
    store.getState().updateBuffer(projectId, fileC, "C edited");
    store.getState().handleRemoteUpdate(projectId, fileC, "C from remote", 10);

    const before = store.getState().getTabState(projectId);
    const fileAData = before.tabData.get(fileA);
    const fileBData = before.tabData.get(fileB);
    const fileCData = before.tabData.get(fileC);

    expect(before.activeTabId).toBe(fileC);
    expect(before.previewTabId).toBe(fileC);
    expect(fileAData?.isDirty).toBe(true);
    expect(fileBData?.isSaving).toBe(true);
    expect(fileCData?.hasConflict).toBe(true);

    store.getState().reorderTabs(projectId, fileA, fileC, "after");

    const after = store.getState().getTabState(projectId);
    expect(after.openTabs).toEqual([fileB, fileC, fileA]);
    expect(after.activeTabId).toBe(before.activeTabId);
    expect(after.previewTabId).toBe(before.previewTabId);
    expect(after.tabData).toBe(before.tabData);
    expect(after.tabData.get(fileA)).toBe(fileAData);
    expect(after.tabData.get(fileB)).toBe(fileBData);
    expect(after.tabData.get(fileC)).toBe(fileCData);
  });
});
