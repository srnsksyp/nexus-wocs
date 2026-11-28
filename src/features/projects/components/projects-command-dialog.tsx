"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FaGithub } from "react-icons/fa";
import { AlertCircleIcon, GlobeIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";

import { useProjects, useDeleteProject } from "../hooks/use-projects";
import { Doc } from "../../../../convex/_generated/dataModel";
import { DeleteProjectDialog } from "./delete-project-dialog";

interface ProjectsCommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getProjectIcon = (project: Doc<"projects">) => {
  if (project.importStatus === "completed")
    return <FaGithub className="size-4 text-muted-foreground" />;

  if (project.importStatus === "failed")
    return <AlertCircleIcon className="size-4 text-muted-foreground" />;

  if (project.importStatus === "importing")
    return (
      <Loader2Icon className="size-4 text-muted-foreground animate-spin" />
    );

  return <GlobeIcon className="size-4 text-muted-foreground" />;
};

export const ProjectsCommandDialog = ({
  open,
  onOpenChange,
}: ProjectsCommandDialogProps) => {
  const router = useRouter();
  const projects = useProjects();
  const deleteProject = useDeleteProject();

  const [projectToDelete, setProjectToDelete] = useState<Doc<"projects"> | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSelect = (projectId: string) => {
    router.push(`/projects/${projectId}`);
    onOpenChange(false);
  };

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    try {
      await deleteProject({ id: projectToDelete._id });
      toast.success("Project deleted successfully");
      setProjectToDelete(null);
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
      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Search Projects"
        description="Search and navigate to your projects"
      >
        <CommandInput
          placeholder="Search projects..."
          data-dialog-autofocus=""
        />
        <CommandList>
          <CommandEmpty>No projects found.</CommandEmpty>
          <CommandGroup heading="Projects">
            {projects?.map((project) => (
              <CommandItem
                key={project._id}
                value={`${project.name}-${project._id}`}
                onSelect={() => handleSelect(project._id)}
                className="group flex items-center justify-between"
              >
                <div className="flex items-center gap-2 truncate">
                  {getProjectIcon(project)}
                  <span className="truncate">{project.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-opacity"
                  title="Delete project"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjectToDelete(project);
                  }}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <DeleteProjectDialog
        open={!!projectToDelete}
        onOpenChange={(isOpen) => {
          if (!isOpen) setProjectToDelete(null);
        }}
        projectName={projectToDelete?.name ?? ""}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />
    </>
  );
};
