// @vitest-environment jsdom
import React, { useEffect, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function FocusDialogHarness() {
  const [open, setOpen] = useState(false);
  const [showTrigger, setShowTrigger] = useState(true);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <>
      {showTrigger && (
        <button type="button" onClick={() => setOpen(true)}>
          Open project dialog
        </button>
      )}
      <button type="button">Outside action</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Project prompt</DialogTitle>
            <DialogDescription>Describe the project to create.</DialogDescription>
          </DialogHeader>
          <input
            aria-label="Project prompt"
            data-dialog-autofocus=""
          />
          <DialogClose asChild>
            <button type="button">Cancel</button>
          </DialogClose>
          <button type="button" onClick={() => setShowTrigger(false)}>
            Remove opener
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe("shared dialog focus management", () => {
  afterEach(() => cleanup());

  it("moves focus into the dialog and restores the pointer trigger on close", async () => {
    render(<FocusDialogHarness />);

    const trigger = screen.getByRole("button", { name: "Open project dialog" });
    fireEvent.click(trigger);

    const prompt = await screen.findByRole("textbox", { name: "Project prompt" });
    expect(prompt).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("restores focus to the keyboard shortcut origin after Escape", async () => {
    render(<FocusDialogHarness />);

    const trigger = screen.getByRole("button", { name: "Open project dialog" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "k", ctrlKey: true });

    const dialog = await screen.findByRole("dialog");
    const prompt = screen.getByRole("textbox", { name: "Project prompt" });
    expect(prompt).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps focus inside the modal when focus is moved toward the page behind it", async () => {
    render(<FocusDialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open project dialog" }));

    const dialog = await screen.findByRole("dialog");
    const outside = screen.getByRole("button", { name: "Outside action" });
    outside.focus();

    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it("closes safely when the original trigger has been removed", async () => {
    render(<FocusDialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open project dialog" }));

    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Remove opener" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
