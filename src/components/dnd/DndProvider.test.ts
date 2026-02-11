import { describe, it, expect } from "vitest";
import { resolveLabelChange } from "./DndProvider";

describe("resolveLabelChange", () => {
  it("returns null when target equals source (sidebar IDs)", () => {
    expect(resolveLabelChange("inbox", "inbox")).toBeNull();
  });

  it("returns null when target equals source (Gmail IDs)", () => {
    expect(resolveLabelChange("Label_1", "Label_1")).toBeNull();
  });

  it("adds TRASH and removes source when dragging to trash", () => {
    const result = resolveLabelChange("trash", "inbox");
    expect(result).toEqual({
      addLabelIds: ["TRASH"],
      removeLabelIds: ["INBOX"],
    });
  });

  it("adds TRASH without removing when source is all mail", () => {
    const result = resolveLabelChange("trash", "all");
    expect(result).toEqual({
      addLabelIds: ["TRASH"],
      removeLabelIds: [],
    });
  });

  it("only adds target when source is all mail", () => {
    const result = resolveLabelChange("inbox", "all");
    expect(result).toEqual({
      addLabelIds: ["INBOX"],
      removeLabelIds: [],
    });
  });

  it("adds target and removes source for normal label move", () => {
    const result = resolveLabelChange("starred", "inbox");
    expect(result).toEqual({
      addLabelIds: ["STARRED"],
      removeLabelIds: ["INBOX"],
    });
  });

  it("works with user label IDs (not in LABEL_MAP)", () => {
    const result = resolveLabelChange("Label_1", "inbox");
    expect(result).toEqual({
      addLabelIds: ["Label_1"],
      removeLabelIds: ["INBOX"],
    });
  });

  it("moves between two user labels", () => {
    const result = resolveLabelChange("Label_2", "Label_1");
    expect(result).toEqual({
      addLabelIds: ["Label_2"],
      removeLabelIds: ["Label_1"],
    });
  });

  it("moves from user label to system label", () => {
    const result = resolveLabelChange("inbox", "Label_1");
    expect(result).toEqual({
      addLabelIds: ["INBOX"],
      removeLabelIds: ["Label_1"],
    });
  });
});
