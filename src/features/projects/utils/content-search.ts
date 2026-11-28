import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { getFilePath } from "@/features/preview/utils/file-tree";

export interface ContentSearchResult {
  id: Id<"files">;
  name: string;
  path: string;
  lineNumber: number;
  lineContent: string;
  preview: string;
  searchValue: string;
}

export interface SearchFilesContentOptions {
  maxFileSize?: number; // Maximum file content length (in characters) to scan (default 300,000)
  maxResults?: number; // Total max results across all files (default 50)
  maxMatchesPerFile?: number; // Max matches to collect per file (default 5)
}

const DEFAULT_MAX_FILE_SIZE = 300_000;
const DEFAULT_MAX_RESULTS = 50;
const DEFAULT_MAX_MATCHES_PER_FILE = 5;

/**
 * Checks if a string contains binary-like characters (e.g. null bytes or heavy control chars)
 */
export const isBinaryContent = (content: string): boolean => {
  if (content.includes("\0")) return true;
  // Inspect the first 1000 characters for excessive non-printable control characters
  const sample = content.slice(0, 1000);
  let controlChars = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    // Tab (9), LF (10), CR (13) are common in text files; other chars < 32 are control chars
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      controlChars++;
    }
  }
  return controlChars > sample.length * 0.1;
};

/**
 * Searches project files for matching content line-by-line.
 * Safe and bounded: handles empty queries, skips storage/binary files and oversized files,
 * limits total results and matches per file.
 */
export const searchFilesByContent = (
  files: Doc<"files">[] | undefined | null,
  rawQuery: string,
  options?: SearchFilesContentOptions,
): ContentSearchResult[] => {
  const query = rawQuery.trim();
  if (!query || !files || files.length === 0) {
    return [];
  }

  const maxFileSize = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
  const maxMatchesPerFile = options?.maxMatchesPerFile ?? DEFAULT_MAX_MATCHES_PER_FILE;

  const filesMap = new Map<Id<"files">, Doc<"files">>(
    files.map((f) => [f._id, f])
  );

  const lowerQuery = query.toLowerCase();
  const results: ContentSearchResult[] = [];

  // Sort files predictably by path
  const textFiles = files
    .filter((f) => f.type === "file" && !f.storageId && typeof f.content === "string")
    .map((f) => ({
      file: f,
      path: getFilePath(f, filesMap),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const { file, path } of textFiles) {
    if (results.length >= maxResults) {
      break;
    }

    const content = file.content;
    if (!content) continue;

    // Safety checks: skip oversized files or binary-like content
    if (content.length > maxFileSize || isBinaryContent(content)) {
      continue;
    }

    // Quick check before splitting lines
    if (!content.toLowerCase().includes(lowerQuery)) {
      continue;
    }

    const lines = content.split("\n");
    let matchesInFile = 0;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      if (results.length >= maxResults || matchesInFile >= maxMatchesPerFile) {
        break;
      }

      const line = lines[lineIdx];
      const matchIndex = line.toLowerCase().indexOf(lowerQuery);

      if (matchIndex !== -1) {
        matchesInFile++;
        const lineNumber = lineIdx + 1;
        const trimmedLine = line.trim();

        // Create a short readable preview (trimmed, up to 100 chars around the match)
        const preview =
          trimmedLine.length > 120
            ? trimmedLine.slice(0, 120) + "..."
            : trimmedLine;

        results.push({
          id: file._id,
          name: file.name,
          path,
          lineNumber,
          lineContent: line,
          preview,
          searchValue: `${path} ${file.name} :${lineNumber} ${trimmedLine}`,
        });
      }
    }
  }

  return results;
};
