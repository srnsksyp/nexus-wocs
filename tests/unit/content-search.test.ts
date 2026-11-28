import { describe, expect, it } from "vitest";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import {
  isBinaryContent,
  searchFilesByContent,
} from "@/features/projects/utils/content-search";

describe("searchFilesByContent utility (Issue #126)", () => {
  const projId = "proj_1" as Id<"projects">;

  const mockFiles: Doc<"files">[] = [
    {
      _id: "f_1" as Id<"files">,
      _creationTime: 100,
      projectId: projId,
      name: "app.tsx",
      type: "file",
      content: "import React from 'react';\nfunction App() {\n  const user = 'alice';\n  return <div>Hello {user}</div>;\n}",
      updatedAt: 100,
    },
    {
      _id: "f_2" as Id<"files">,
      _creationTime: 101,
      projectId: projId,
      name: "utils.ts",
      type: "file",
      content: "export function calculateTotal(items: number[]) {\n  return items.reduce((a, b) => a + b, 0);\n}\nexport const user = 'admin';",
      updatedAt: 101,
    },
    {
      _id: "f_3" as Id<"files">,
      _creationTime: 102,
      projectId: projId,
      name: "image.png",
      type: "file",
      storageId: "storage_1" as Id<"_storage">,
      updatedAt: 102,
    },
    {
      _id: "folder_1" as Id<"files">,
      _creationTime: 103,
      projectId: projId,
      name: "components",
      type: "folder",
      updatedAt: 103,
    },
  ];

  it("returns matching lines with file name, path, line number, and preview", () => {
    const results = searchFilesByContent(mockFiles, "calculateTotal");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("utils.ts");
    expect(results[0].lineNumber).toBe(1);
    expect(results[0].preview).toContain("export function calculateTotal");
    expect(results[0].path).toBe("utils.ts");
  });

  it("finds matches across multiple files case-insensitively", () => {
    const results = searchFilesByContent(mockFiles, "USER");
    expect(results.length).toBeGreaterThanOrEqual(2);

    const fileNames = results.map((r) => r.name);
    expect(fileNames).toContain("app.tsx");
    expect(fileNames).toContain("utils.ts");
  });

  it("returns empty array for empty or whitespace-only queries", () => {
    expect(searchFilesByContent(mockFiles, "")).toEqual([]);
    expect(searchFilesByContent(mockFiles, "   ")).toEqual([]);
    expect(searchFilesByContent(mockFiles, "\t\n")).toEqual([]);
  });

  it("returns empty array when no matches are found", () => {
    const results = searchFilesByContent(mockFiles, "nonExistentSymbolXYZ");
    expect(results).toEqual([]);
  });

  it("handles null or undefined files array gracefully", () => {
    expect(searchFilesByContent(null, "foo")).toEqual([]);
    expect(searchFilesByContent(undefined, "foo")).toEqual([]);
    expect(searchFilesByContent([], "foo")).toEqual([]);
  });

  it("skips binary storage files and folders without content", () => {
    const results = searchFilesByContent(mockFiles, "storage_1");
    expect(results).toEqual([]);
  });

  it("respects maxResults limit", () => {
    const results = searchFilesByContent(mockFiles, "e", { maxResults: 1 });
    expect(results).toHaveLength(1);
  });

  it("respects maxMatchesPerFile limit", () => {
    const multiMatchFiles: Doc<"files">[] = [
      {
        _id: "f_multi" as Id<"files">,
        _creationTime: 100,
        projectId: projId,
        name: "test.txt",
        type: "file",
        content: "line 1 test\nline 2 test\nline 3 test\nline 4 test\nline 5 test\nline 6 test",
        updatedAt: 100,
      },
    ];

    const results = searchFilesByContent(multiMatchFiles, "test", {
      maxMatchesPerFile: 3,
    });
    expect(results).toHaveLength(3);
  });

  it("skips files exceeding maxFileSize", () => {
    const largeFile: Doc<"files">[] = [
      {
        _id: "f_large" as Id<"files">,
        _creationTime: 100,
        projectId: projId,
        name: "large.txt",
        type: "file",
        content: "a".repeat(10_000),
        updatedAt: 100,
      },
    ];

    const results = searchFilesByContent(largeFile, "a", { maxFileSize: 500 });
    expect(results).toHaveLength(0);
  });

  it("identifies binary-like content correctly and skips it", () => {
    expect(isBinaryContent("hello\0world")).toBe(true);
    expect(isBinaryContent("normal text with \t tabs and \n newlines")).toBe(false);

    const binaryFile: Doc<"files">[] = [
      {
        _id: "f_bin" as Id<"files">,
        _creationTime: 100,
        projectId: projId,
        name: "binary.dat",
        type: "file",
        content: "PNG\0\0\0\x01\x02\x03\x04IHDR",
        updatedAt: 100,
      },
    ];

    const results = searchFilesByContent(binaryFile, "PNG");
    expect(results).toHaveLength(0);
  });
});
