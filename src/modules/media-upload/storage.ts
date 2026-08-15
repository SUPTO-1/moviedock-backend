import { existsSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { env } from "../../app/config/env";
import { HttpError } from "../../app/errors/http-error";
import type { MediaType } from "./allowed-types";

/**
 * Pure-path layer for the upload module.
 *
 * The client never gets to pick a final filesystem path. We resolve it here
 * from the media type alone (so /api/photos/upload → photosRoot), and only
 * a sanitised, server-validated `subfolder` string can be appended.
 *
 * `safeSubfolder` is rejected if it contains any path separators, `..`,
 * drive letters, or anything outside `[A-Za-z0-9_-]`. That is strict enough
 * to make path traversal impossible.
 */

const MAX_SUBDIR_LENGTH = 80;
const MAX_FILENAME_LENGTH = 200;

/** Reserved Windows filenames that must never be used as the final file. */
const RESERVED_WINDOWS_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

/** Map MediaType (singular) to the configured upload-root key (plural). */
const ROOT_KEY_FOR: Record<MediaType, keyof typeof env.uploadRoots> = {
  photo: "photos",
  movie: "movies",
  series: "series",
  anime: "anime",
};

/** Subfolders may only contain letters, digits, underscores, hyphens. */
const SUBDIR_REGEX = /^[A-Za-z0-9_-]+$/;

/**
 * Filenames may contain letters/digits/underscores/hyphens/dots/spaces and
 * parentheses. We strip everything else so a malicious `..\..\` is reduced
 * to `....` before it ever hits the filesystem.
 */
const FILENAME_BODY_REGEX = /[^A-Za-z0-9._\- ()]/g;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeSubfolder(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_SUBDIR_LENGTH) {
    throw new HttpError(400, `Subfolder name too long (max ${MAX_SUBDIR_LENGTH} characters)`);
  }
  if (!SUBDIR_REGEX.test(trimmed)) {
    throw new HttpError(
      400,
      "Subfolder may only contain letters, digits, hyphens, and underscores",
    );
  }
  return trimmed;
}

function splitName(name: string): { base: string; ext: string } {
  const ext = extname(name);
  const base = ext && name.length > ext.length ? name.slice(0, name.length - ext.length) : name;
  return { base, ext: ext.slice(1) };
}

export function sanitizeFilename(raw: string | undefined): string {
  if (!raw) {
    throw new HttpError(400, "File is missing a filename");
  }
  // Strip control chars and disallowed punctuation. Browsers usually send
  // the basename only, but we still defend against anything weird.
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .split(/[\\/]/)
    .pop()!;
  const collapsed = collapseWhitespace(cleaned);
  if (!collapsed) {
    throw new HttpError(400, "File has an invalid filename");
  }
  if (collapsed.length > MAX_FILENAME_LENGTH) {
    throw new HttpError(400, `Filename too long (max ${MAX_FILENAME_LENGTH} characters)`);
  }

  const { base, ext } = splitName(collapsed);
  const safeBase = collapseWhitespace(base.replace(FILENAME_BODY_REGEX, ""));
  const safeExt = ext.replace(FILENAME_BODY_REGEX, "");

  const finalBase = safeBase || "upload";
  const finalName = safeExt ? `${finalBase}.${safeExt}` : finalBase;

  const stem = finalBase.toLowerCase();
  if (RESERVED_WINDOWS_NAMES.has(stem)) {
    throw new HttpError(400, `Filename "${finalBase}" is reserved on Windows`);
  }

  // Reject `.` and `..` as the entire name (defence in depth).
  if (finalBase === "." || finalBase === "..") {
    throw new HttpError(400, "Filename may not be . or ..");
  }

  return finalName;
}

function isContained(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  // `rel === ""` means child === parent (allowed for the root itself);
  // any other relative path that doesn't start with `..` and isn't absolute
  // (would imply an escape on Windows) is still inside the parent.
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Resolve the absolute directory a new file should land in, given the
 * media type and an already-sanitised subfolder. Asserts the resolved
 * path stays inside the per-type root so a future refactor cannot
 * accidentally widen the write scope.
 */
export function resolveTargetDirectory(mediaType: MediaType, subfolder: string | undefined): string {
  const root = env.uploadRoots[ROOT_KEY_FOR[mediaType]];
  if (!root) {
    throw new HttpError(500, `No upload root configured for ${mediaType}`);
  }
  const absoluteRoot = resolve(root);
  const candidate = subfolder ? join(absoluteRoot, subfolder) : absoluteRoot;
  const resolved = resolve(candidate);
  if (!isContained(resolved, absoluteRoot)) {
    // Belt-and-braces — sanitizeSubfolder already prevents this, but if a
    // future maintainer weakens that, this still catches path escape.
    throw new HttpError(400, "Subfolder resolves outside the upload root");
  }
  return resolved;
}

/**
 * If `<dir>/<name>` exists, return the next available dedupe variant.
 * `IMG_1234.jpg` → `IMG_1234.jpg`, `IMG_1234 (1).jpg`, `IMG_1234 (2).jpg`, …
 *
 * Matches the convention commonly used by file managers and Jellyfin's own
 * rename-on-import behaviour, so users see familiar names.
 */
export function dedupeFilename(directory: string, originalName: string): string {
  const primary = join(directory, originalName);
  if (!existsSync(primary)) {
    return originalName;
  }
  const { base, ext } = splitName(originalName);
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = ext ? `${base} (${index}).${ext}` : `${base} (${index})`;
    if (!existsSync(join(directory, candidate))) {
      return candidate;
    }
  }
  // Effectively unreachable — collisions past 10k would mean the user has
  // already uploaded that many files of the same name. Return the original;
  // the write will fail with EEXIST and the user will see an error.
  return originalName;
}
