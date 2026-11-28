"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { Id } from "../../../../convex/_generated/dataModel";

interface SelectedProjectState {
  selectedProjectId: Id<"projects"> | null;
  setSelectedProjectId: (projectId: Id<"projects">) => void;
  clearSelectedProjectId: (projectId?: Id<"projects">) => void;
}

export const useSelectedProjectStore = create<SelectedProjectState>()(
  persist(
    (set) => ({
      selectedProjectId: null,
      setSelectedProjectId: (projectId) => set({ selectedProjectId: projectId }),
      clearSelectedProjectId: (projectId) =>
        set((state) =>
          !projectId || state.selectedProjectId === projectId
            ? { selectedProjectId: null }
            : state,
        ),
    }),
    {
      name: "nexus-selected-project",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ selectedProjectId: state.selectedProjectId }),
      skipHydration: true,
    },
  ),
);
