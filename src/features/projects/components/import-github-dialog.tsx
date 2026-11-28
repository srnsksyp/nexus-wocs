import ky, { HTTPError } from "ky";
import { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useClerk } from "@clerk/nextjs";
import { GitBranchIcon, Loader2Icon, FolderGit2Icon, FileTextIcon, ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

import { Id } from "../../../../convex/_generated/dataModel";

const formSchema = z.object({
  url: z.url("Please enter a valid URL"),
});

export interface RepositoryPreviewData {
  owner: string;
  repo: string;
  defaultBranch?: string;
  description?: string | null;
  isPrivate?: boolean;
  fileCount?: number;
  sampleFiles?: string[];
  truncated?: boolean;
}

interface ImportGithubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ImportGithubDialog = ({
  open,
  onOpenChange,
}: ImportGithubDialogProps) => {
  const router = useRouter();
  const { openUserProfile } = useClerk();
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requiresGithubConnection, setRequiresGithubConnection] = useState(false);
  const [previewData, setPreviewData] = useState<RepositoryPreviewData | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const isImportingRef = useRef(false);

  const form = useForm({
    defaultValues: {
      url: "",
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      setRequestError(null);
      setRequiresGithubConnection(false);

      try {
        const preview = await ky
          .post("/api/github/preview", {
            json: { url: value.url },
          })
          .json<RepositoryPreviewData & { success: boolean }>();

        setRequestError(null);
        setRequiresGithubConnection(false);
        setPreviewData(preview);
      } catch (error) {
        if (error instanceof HTTPError) {
          try {
            const body = await error.response.json<{ error?: string }>();
            if (body?.error?.includes("GitHub not connected")) {
              setRequiresGithubConnection(true);
              setRequestError(
                "Your GitHub account is not connected. Connect it before retrying this import."
              );
              return;
            }
            if (body?.error?.includes("rate limit")) {
              setRequestError(
                "GitHub API rate limit exceeded. Please wait a moment before trying again."
              );
              return;
            }
            if (body?.error) {
              setRequestError(body.error);
              return;
            }
          } catch {
            // Fall back to general preview error
          }
        }

        setRequestError(
          "Unable to import repository. Check the URL and your GitHub access, then try again."
        );
      }
    },
  });

  const handleConfirmImport = async () => {
    if (isImportingRef.current) return;
    isImportingRef.current = true;
    setIsImporting(true);
    setRequestError(null);

    const url = form.getFieldValue("url");

    try {
      const { projectId } = await ky
        .post("/api/github/import", {
          json: { url },
        })
        .json<{
          success: boolean;
          projectId: Id<"projects">;
          eventId: string;
        }>();

      toast.success("Importing repository...");
      setPreviewData(null);
      onOpenChange(false);
      form.reset();

      router.push(`/projects/${projectId}`);
    } catch (error) {
      if (error instanceof HTTPError) {
        try {
          const body = await error.response.json<{ error?: string }>();
          if (body?.error?.includes("GitHub not connected")) {
            setRequiresGithubConnection(true);
            setRequestError(
              "Your GitHub account is not connected. Connect it before retrying this import."
            );
            return;
          }
          if (body?.error) {
            setRequestError(body.error);
            return;
          }
        } catch {
          // Fall back to general error
        }
      }

      setRequestError(
        "Unable to import repository. Check the URL and your GitHub access, then try again."
      );
    } finally {
      isImportingRef.current = false;
      setIsImporting(false);
    }
  };

  const handleResetDialog = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setPreviewData(null);
      setRequestError(null);
      setRequiresGithubConnection(false);
      setIsImporting(false);
      form.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleResetDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {previewData ? "Confirm Repository Import" : "Import from GitHub"}
          </DialogTitle>
          <DialogDescription>
            {previewData
              ? "Review repository details and file scope before confirming project creation."
              : "Enter a GitHub repository URL to import. A new project will be created with the repository contents."}
          </DialogDescription>
        </DialogHeader>

        {previewData ? (
          <div className="flex flex-col gap-4 py-2">
            <div className="rounded-md border p-3 bg-muted/40 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderGit2Icon className="size-5 text-muted-foreground" />
                  <span className="font-semibold text-sm">
                    {previewData.owner}/{previewData.repo}
                  </span>
                </div>
                {previewData.isPrivate !== undefined && (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {previewData.isPrivate ? "Private" : "Public"}
                  </span>
                )}
              </div>

              {previewData.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {previewData.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t border-muted">
                <div className="flex items-center gap-1.5">
                  <GitBranchIcon className="size-3.5" />
                  <span>
                    Default branch:{" "}
                    <strong className="text-foreground font-mono">
                      {previewData.defaultBranch || "main"}
                    </strong>
                  </span>
                </div>
                {previewData.fileCount !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <FileTextIcon className="size-3.5" />
                    <span>
                      {previewData.fileCount}{" "}
                      {previewData.fileCount === 1 ? "file" : "files"}
                      {previewData.truncated ? "+" : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {previewData.sampleFiles && previewData.sampleFiles.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Expected files preview ({previewData.sampleFiles.length} of {previewData.fileCount || previewData.sampleFiles.length}):
                </span>
                <div className="rounded border bg-muted/20 p-2 max-h-36 overflow-y-auto font-mono text-xs text-muted-foreground space-y-1">
                  {previewData.sampleFiles.map((file) => (
                    <div key={file} className="truncate flex items-center gap-1.5">
                      <span className="text-muted-foreground/60">📄</span>
                      <span>{file}</span>
                    </div>
                  ))}
                  {previewData.truncated && (
                    <div className="text-[11px] text-muted-foreground/80 italic pt-1">
                      ...and more repository files
                    </div>
                  )}
                </div>
              </div>
            )}

            {requestError && (
              <FieldError id="github-import-request-error">
                <span>{requestError}</span>
                {requiresGithubConnection && (
                  <button
                    type="button"
                    onClick={() => openUserProfile()}
                    className="ml-1 underline underline-offset-2"
                  >
                    Connect GitHub
                  </button>
                )}
              </FieldError>
            )}

            <DialogFooter className="mt-4 flex sm:justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={isImporting}
                onClick={() => {
                  setPreviewData(null);
                  setRequestError(null);
                }}
              >
                <ArrowLeftIcon className="size-4 mr-1" />
                Back to URL
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isImporting}
                  onClick={() => handleResetDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={isImporting}
                  onClick={handleConfirmImport}
                >
                  {isImporting ? (
                    <>
                      <Loader2Icon className="size-4 animate-spin mr-1.5" />
                      Importing...
                    </>
                  ) : (
                    "Confirm Import"
                  )}
                </Button>
              </div>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <form.Field name="url">
                  {(field) => {
                    const isInvalid =
                      field.state.meta.isTouched && !field.state.meta.isValid;

                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>
                          Repository URL
                        </FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          aria-invalid={isInvalid}
                          data-dialog-autofocus=""
                          aria-describedby={requestError ? "github-import-request-error" : undefined}
                          disabled={isSubmitting}
                          placeholder="https://github.com/owner/repo"
                        />
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                        {requestError && (
                          <FieldError id="github-import-request-error">
                            <span>{requestError}</span>
                            {requiresGithubConnection && (
                              <button
                                type="button"
                                onClick={() => openUserProfile()}
                                className="ml-1 underline underline-offset-2"
                              >
                                Connect GitHub
                              </button>
                            )}
                          </FieldError>
                        )}
                      </Field>
                    );
                  }}
                </form.Field>
              )}
            </form.Subscribe>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleResetDialog(false)}
              >
                Cancel
              </Button>
              <form.Subscribe
                selector={(state) => [state.canSubmit, state.isSubmitting]}
              >
                {([canSubmit, isSubmitting]) => (
                  <Button
                    type="submit"
                    disabled={!canSubmit || isSubmitting}
                  >
                    {isSubmitting ? "Loading Preview..." : "Import"}
                  </Button>
                )}
              </form.Subscribe>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};