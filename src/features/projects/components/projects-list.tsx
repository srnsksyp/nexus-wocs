"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaGithub } from "react-icons/fa";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  GlobeIcon,
  Loader2Icon,
  MoreVerticalIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { Kbd } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Doc } from "../../../../convex/_generated/dataModel";
import { useProject, useProjectsPartial, useDeleteProject } from "../hooks/use-projects";
import { useSelectedProjectStore } from "../store/use-selected-project-store";
import { DeleteProjectDialog } from "./delete-project-dialog";

const formatTimestamp = (timestamp: number) => {
  return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
};

const getProjectIcon = (project: Doc<"projects">) => {
  if (project.importStatus === "completed")
    return <FaGithub className="size-3.5 text-muted-foreground" />;

  if (project.importStatus === "failed")
    return <AlertCircleIcon className="size-3.5 text-muted-foreground" />;

  if (project.importStatus === "importing")
    return (
      <Loader2Icon className="size-3.5 text-muted-foreground animate-spin" />
    );

  return <GlobeIcon className="size-3.5 text-muted-foreground" />;
};

interface ProjectsListProps {
  onViewAll: () => void;
}

const ContinueCard = ({
  data,
  onDelete,
  onSelect,
}: {
  data: Doc<"projects">;
  onDelete: (project: Doc<"projects">) => void;
  onSelect: (projectId: Id<"projects">) => void;
}) => {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">Last updated</span>
      <div className="relative group/card flex items-stretch border bg-background">
        <Button
          variant="ghost"
          asChild
          className="h-auto flex-1 items-start justify-start p-4 bg-transparent border-0 rounded-none flex flex-col gap-2 hover:bg-accent/40"
        >
          <Link
            href={`/projects/${data._id}`}
            onClick={() => onSelect(data._id)}
            className="group flex-1 w-full"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {getProjectIcon(data)}
                <span className="font-medium truncate">{data.name}</span>
              </div>
              <ArrowRightIcon className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </div>
            <span className="text-xs text-muted-foreground">
              {formatTimestamp(data.updatedAt)}
            </span>
          </Link>
        </Button>
        <div className="flex items-center pr-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label={`Actions for ${data.name}`}
              >
                <MoreVerticalIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(data)}
                className="cursor-pointer"
              >
                <Trash2Icon className="size-4" />
                <span>Delete Project</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
};

const ProjectItem = ({
  data,
  onDelete,
  onSelect,
}: {
  data: Doc<"projects">;
  onDelete: (project: Doc<"projects">) => void;
  onSelect: (projectId: Id<"projects">) => void;
}) => {
  return (
    <li className="flex items-center justify-between w-full group py-1">
      <Link
        href={`/projects/${data._id}`}
        onClick={() => onSelect(data._id)}
        className="text-sm text-foreground/60 font-medium hover:text-foreground flex items-center justify-between flex-1 min-w-0 pr-2"
      >
        <div className="flex items-center gap-2 truncate">
          {getProjectIcon(data)}
          <span className="truncate">{data.name}</span>
        </div>
        <span className="text-xs text-muted-foreground group-hover:text-foreground/60 transition-colors shrink-0">
          {formatTimestamp(data.updatedAt)}
        </span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            className="size-6 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
            aria-label={`Actions for ${data.name}`}
          >
            <MoreVerticalIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDelete(data)}
            className="cursor-pointer"
          >
            <Trash2Icon className="size-4" />
            <span>Delete Project</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
};

export const ProjectsList = ({ onViewAll }: ProjectsListProps) => {
  const projects = useProjectsPartial(6);
  const deleteProject = useDeleteProject();
  const selectedProjectId = useSelectedProjectStore((state) => state.selectedProjectId);
  const setSelectedProjectId = useSelectedProjectStore((state) => state.setSelectedProjectId);
  const clearSelectedProjectId = useSelectedProjectStore((state) => state.clearSelectedProjectId);
  const selectedProject = useProject(selectedProjectId);

  const [projectToDelete, setProjectToDelete] = useState<Doc<"projects"> | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (selectedProjectId && selectedProject === null) {
      clearSelectedProjectId(selectedProjectId);
    }
  }, [selectedProjectId, selectedProject, clearSelectedProjectId]);

  const handleDeleteConfirm = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    try {
      await deleteProject({ id: projectToDelete._id });
      if (selectedProjectId === projectToDelete._id) {
        clearSelectedProjectId(projectToDelete._id);
      }
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

  if (projects === undefined || (selectedProjectId && selectedProject === undefined)) {
    return <Spinner className="size-4 text-ring" />;
  }

  const continueProject = selectedProject ?? projects[0];
  const recentProjects = projects.filter(
    (project) => project._id !== continueProject?._id,
  );

  return (
    <>
      <div className="flex flex-col gap-4">
        {continueProject ? (
          <ContinueCard
            data={continueProject}
            onDelete={(proj) => setProjectToDelete(proj)}
            onSelect={setSelectedProjectId}
          />
        ) : null}
        {recentProjects.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Recent projects
              </span>
              <button
                onClick={onViewAll}
                className="flex items-center gap-2 text-muted-foreground text-xs hover:text-foreground transition-colors"
              >
                <span>View all</span>
                <Kbd className="bg-accent border">ctrl+k</Kbd>
              </button>
            </div>
            <ul className="flex flex-col">
              {recentProjects.map((project) => (
                <ProjectItem
                  key={project._id}
                  data={project}
                  onDelete={(proj) => setProjectToDelete(proj)}
                  onSelect={setSelectedProjectId}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

      <DeleteProjectDialog
        open={!!projectToDelete}
        onOpenChange={(open) => {
          if (!open) setProjectToDelete(null);
        }}
        projectName={projectToDelete?.name ?? ""}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />
    </>
  );
};
