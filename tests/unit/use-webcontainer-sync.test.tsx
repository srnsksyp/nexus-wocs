// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  files: [] as Array<Record<string, unknown>>,
  boot: vi.fn(),
  serverReady: null as null | ((port: number, url: string) => void),
  container: null as any,
}));

vi.mock("@webcontainer/api", () => ({
  WebContainer: {
    boot: (...args: unknown[]) => mocks.boot(...args),
  },
}));

vi.mock("@/features/projects/hooks/use-files", () => ({
  useFiles: () => mocks.files,
}));

import { useWebContainer } from "@/features/preview/hooks/use-webcontainer";

const folder = {
  _id: "folder-src",
  name: "src",
  type: "folder",
  parentId: undefined,
  content: undefined,
  storageId: undefined,
  updatedAt: 1,
};

function sourceFile(content: string) {
  return {
    _id: "file-index",
    name: "index.ts",
    type: "file",
    parentId: "folder-src",
    content,
    storageId: undefined,
    updatedAt: 1,
  };
}

function assetFolder() {
  return {
    _id: "folder-assets",
    name: "assets",
    type: "folder",
    parentId: undefined,
    content: undefined,
    storageId: undefined,
    updatedAt: 1,
  };
}

function assetFile(content: string) {
  return {
    _id: "file-asset",
    name: "logo.svg",
    type: "file",
    parentId: "folder-assets",
    content,
    storageId: undefined,
    updatedAt: 1,
  };
}

function createContainer() {
  let spawnCount = 0;
  const writer = {
    write: vi.fn().mockResolvedValue(undefined),
    releaseLock: vi.fn(),
  };

  return {
    fs: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      rm: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    mount: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(
      (
        _event: string,
        callback: (port: number, url: string) => void
      ) => {
        mocks.serverReady = callback;
        return vi.fn();
      }
    ),
    spawn: vi.fn().mockImplementation(() => {
      const isInstallProcess = spawnCount++ === 0;
      return {
        exit: isInstallProcess
          ? Promise.resolve(0)
          : new Promise<number>(() => {}),
        output: {
          pipeTo: vi.fn().mockResolvedValue(undefined),
        },
        input: {
          getWriter: () => writer,
        },
        kill: vi.fn(),
      };
    }),
    teardown: vi.fn(),
  };
}

describe("useWebContainer file-sync recovery (Issue #117)", () => {
  let container: ReturnType<typeof createContainer>;

  beforeEach(() => {
    mocks.files = [folder, sourceFile("initial content")];
    mocks.serverReady = null;
    container = createContainer();
    mocks.container = container;
    mocks.boot.mockReset().mockResolvedValue(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the queue alive after a failed write and retries from the last successful snapshot", async () => {
    const { result, rerender, unmount } = renderHook(() =>
      useWebContainer({
        projectId: "project-1" as never,
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(mocks.serverReady).toBeTypeOf("function");
    });

    act(() => {
      mocks.serverReady?.(3000, "http://localhost:3000");
    });

    await waitFor(() => {
      expect(result.current.status).toBe("running");
      expect(result.current.isSyncing).toBe(false);
    });

    container.fs.writeFile.mockRejectedValueOnce(
      new Error("EACCES: raw runtime filesystem details")
    );
    mocks.files = [folder, sourceFile("failed update")];
    rerender();

    await waitFor(() => {
      expect(result.current.syncError).toBe(
        'Couldn\'t write the file "src/index.ts" to the preview.'
      );
    });

    expect(result.current.status).toBe("running");
    expect(result.current.error).toBeNull();
    expect(container.fs.writeFile).toHaveBeenNthCalledWith(
      1,
      "src/index.ts",
      "failed update"
    );

    // A later Convex update must still be processed. Since the failed
    // snapshot was not committed, the retry writes the latest content.
    mocks.files = [folder, sourceFile("recovered update")];
    rerender();

    await waitFor(() => {
      expect(container.fs.writeFile).toHaveBeenCalledTimes(2);
      expect(result.current.syncError).toBeNull();
      expect(result.current.isSyncing).toBe(false);
    });

    expect(container.fs.writeFile).toHaveBeenNthCalledWith(
      2,
      "src/index.ts",
      "recovered update"
    );

    // A mkdir failure is also surfaced and does not poison the next queue task.
    container.fs.mkdir.mockRejectedValueOnce(
      new Error("EACCES: cannot create directory")
    );
    mocks.files = [
      folder,
      sourceFile("recovered update"),
      assetFolder(),
      assetFile("<svg />"),
    ];
    rerender();

    await waitFor(() => {
      expect(result.current.syncError).toBe(
        'Couldn\'t create the folder "assets" in the preview.'
      );
    });

    act(() => result.current.resync());

    await waitFor(() => {
      expect(result.current.syncError).toBeNull();
      expect(container.fs.writeFile).toHaveBeenCalledWith(
        "assets/logo.svg",
        "<svg />"
      );
    });

    // The failure was handled inside the queue; the hook remains healthy.
    expect(result.current.status).toBe("running");
    expect(result.current.error).toBeNull();

    unmount();
  });
});
