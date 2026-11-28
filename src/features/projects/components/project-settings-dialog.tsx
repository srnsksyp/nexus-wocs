"use client";

import { useState } from "react";
import { SettingsIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

import { Id } from "../../../../convex/_generated/dataModel";
import { useProject, useDeleteProject } from "../hooks/use-projects";
import { DeleteProjectDialog } from "./delete-project-dialog";

interface ProjectSettingsDialogProps {
  projectId: Id<"projects">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProjectSettingsDialog = ({
  projectId,
  open,
  onOpenChange,
}: ProjectSettingsDialogProps) => {
  const router = useRouter();
  const project = useProject(projectId);
  const deleteProject = useDeleteProject();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteProject({ id: projectId });
      toast.success("Project deleted successfully");
      setDeleteDialogOpen(false);
      onOpenChange(false);
      router.push("/");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete project";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <SettingsIcon className="size-5 text-muted-foreground" />
              <DialogTitle tabIndex={-1} data-dialog-autofocus="">
                Project Settings
              </DialogTitle>
            </div>
            <DialogDescription>
              Manage settings and configuration for {project?.name ?? "this project"}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Project Name</h4>
              <p className="text-xs text-muted-foreground">
                {project?.name ?? "Loading..."}
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-destructive flex items-center gap-1.5">
                <Trash2Icon className="size-4" />
                Danger Zone
              </h4>
              <p className="text-xs text-muted-foreground">
                Permanently delete this project, along with all of its files, conversations, and data.
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete this project
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteProjectDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        projectName={project?.name ?? ""}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />
    </>
  );
};
