"use client";

import { create } from "zustand";

import { Id } from "../../../../convex/_generated/dataModel";

export type PreviewStatus = "idle" | "booting" | "installing" | "running" | "error";

interface PreviewRestartState {
  status: PreviewStatus;
  restart: (() => void) | null;
  projectId: Id<"projects"> | null;
  registerPreview: (
    projectId: Id<"projects">,
    restart: () => void,
    status: PreviewStatus,
  ) => void;
  updateStatus: (projectId: Id<"projects">, status: PreviewStatus) => void;
  unregisterPreview: (projectId: Id<"projects">) => void;
}

export const usePreviewRestartStore = create<PreviewRestartState>((set) => ({
  status: "idle",
  restart: null,
  projectId: null,
  registerPreview: (projectId, restart, status) =>
    set({ projectId, restart, status }),
  updateStatus: (projectId, status) =>
    set((state) =>
      state.projectId === projectId ? { status } : state,
    ),
  unregisterPreview: (projectId) =>
    set((state) =>
      state.projectId === projectId
        ? { projectId: null, restart: null, status: "idle" }
        : state,
    ),
}));
