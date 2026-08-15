import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import Busboy from "busboy";
import type { Request, Response } from "express";
import { env } from "../../app/config/env";
import { HttpError } from "../../app/errors/http-error";
import { isAllowedExtension, type MediaType } from "./allowed-types";
import {
  dedupeFilename,
  resolveTargetDirectory,
  sanitizeFilename,
  sanitizeSubfolder,
} from "./storage";

/**
 * Streams an incoming multipart upload straight to the configured Jellyfin
 * library directory. No intermediate temp file, no per-file buffering beyond
 * the active chunk. Memory usage is dominated by the busboy chunk size
 * (~64 KB), independent of file size.
 *
 * Per-file responses are collected and returned in one JSON envelope so the
 * UI can show a mixed-success summary.
 *
 * NOTE on streaming integrity: the request is consumed exclusively via
 * `req.pipe(busboy)`. We do NOT attach a `'data'` listener to `req`
 * concurrently — adding one switches the request stream into manual flowing
 * mode and breaks pipe-mode backpressure, which would let chunks back up
 * inside busboy on a slow write target.
 */

type UploadOutcome =
  | {
      status: "ok";
      /** Fieldname busboy reported the file under — stable for matching. */
      fieldName: string;
      originalName: string;
      savedAs: string;
      size: number;
      mediaType: MediaType;
    }
  | { status: "rejected"; fieldName: string; originalName: string; reason: string }
  | { status: "error"; fieldName: string; originalName: string; reason: string };

type FilePart = {
  fieldName: string;
  name: string;
  mime: string;
  subfolder?: string;
  stream: NodeJS.ReadableStream;
};

async function ensureDirectoryExists(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
}

function safeStatEmpty(
  destination: string,
  part: Pick<FilePart, "fieldName" | "name">,
): Promise<UploadOutcome | null> {
  return stat(destination)
    .then((stats) => {
      if (stats.size === 0) {
        return rm(destination, { force: true }).then(() => ({
          status: "error" as const,
          fieldName: part.fieldName,
          originalName: part.name,
          reason: "File arrived empty",
        }));
      }
      return null;
    })
    .catch(() => null);
}

async function pipeFileToDestination(part: FilePart, destination: string): Promise<void> {
  const writeStream: WriteStream = createWriteStream(destination);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const cleanup = (err: Error) => {
      writeStream.destroy();
      rm(destination, { force: true }).finally(() => reject(err));
    };

    part.stream.on("error", (err: Error) => cleanup(err));
    writeStream.on("error", (err: Error) => cleanup(err));

    part.stream.on("limit", () => cleanup(new HttpError(413, `File exceeds size limit (${part.name})`)));

    writeStream.on("finish", () => settle(() => resolve()));
    writeStream.on("close", () => {
      // Backstop for the destroy() path, which emits `close` without `finish`.
      if (!settled) cleanup(new HttpError(500, "Stream closed before flush completed"));
    });

    part.stream.pipe(writeStream);
  });
}

async function processOneFile(mediaType: MediaType, part: FilePart): Promise<UploadOutcome> {
  const extension = extname(part.name).slice(1).toLowerCase();
  // The browser's Content-Type is untrusted metadata — we never use it to
  // pick the write path. The extension allowlist below is the real gate,
  // and `sanitizeFilename` strips anything outside the filename allowlist
  // so a renamed `.exe` lands as a `.jpg` file with no executable extension.
  // Browsers also routinely send `application/octet-stream` or empty MIME
  // for less-common formats (MKV, M4V, HEIC) on desktop and mobile, so any
  // attempt to enforce MIME here creates more false rejections than it
  // prevents real attacks.
  if (!isAllowedExtension(mediaType, extension)) {
    part.stream.resume();
    return {
      status: "rejected",
      fieldName: part.fieldName,
      originalName: part.name,
      reason: `Unsupported file extension ".${extension}"`,
    };
  }

  let safeName: string;
  let safeSubdir: string | undefined;
  try {
    safeName = sanitizeFilename(part.name);
    safeSubdir = sanitizeSubfolder(part.subfolder);
  } catch (error) {
    part.stream.resume();
    return {
      status: "rejected",
      fieldName: part.fieldName,
      originalName: part.name,
      reason: error instanceof Error ? error.message : "Invalid filename",
    };
  }

  const directory = resolveTargetDirectory(mediaType, safeSubdir);
  await ensureDirectoryExists(directory);
  const dedupedName = dedupeFilename(directory, safeName);
  const destination = join(directory, dedupedName);

  try {
    await pipeFileToDestination(part, destination);
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        status: "error",
        fieldName: part.fieldName,
        originalName: part.name,
        reason: error.message,
      };
    }
    throw error;
  }

  const empty = await safeStatEmpty(destination, part);
  if (empty) return empty;

  const stats = await stat(destination);
  return {
    status: "ok",
    fieldName: part.fieldName,
    originalName: part.name,
    savedAs: destination,
    size: stats.size,
    mediaType,
  };
}

export function createUploadController(mediaType: MediaType) {
  return async function uploadHandler(req: Request, res: Response): Promise<void> {
    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      throw new HttpError(400, "Upload must use multipart/form-data");
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: env.uploadLimits[mediaType],
        files: 200,
        fields: 200,
        fieldSize: 4 * 1024,
      },
    });

    const outcomes: UploadOutcome[] = [];
    const inFlight: Promise<void>[] = [];
    let nextSubfolder: string | undefined;

    // Subfolder is accepted as a future hook — there is no UI sending it
    // yet, but busboy's field handler is cheap to keep so a later release
    // can wire per-file subfolders without changing the controller shape.
    busboy.on("field", (name, value) => {
      if (name === "subfolder" && typeof value === "string") {
        nextSubfolder = value;
      }
    });

    busboy.on(
      "file",
      (
        fieldName: string,
        fileStream: NodeJS.ReadableStream,
        info: { filename?: string; mimeType?: string },
      ) => {
        // Accept the bare `files` fieldname as well as per-index
        // `files[<n>]` so the frontend can disambiguate duplicates.
        const isBatchField = fieldName === "files" || fieldName === "file";
        const isIndexedField = fieldName.startsWith("files[") && fieldName.endsWith("]");
        if (!isBatchField && !isIndexedField) {
          fileStream.resume();
          return;
        }
        const part: FilePart = {
          fieldName,
          name: info.filename ?? "",
          mime: (info.mimeType ?? "").toLowerCase(),
          subfolder: nextSubfolder,
          stream: fileStream,
        };
        nextSubfolder = undefined;

        const task = processOneFile(mediaType, part)
          .then((outcome) => {
            outcomes.push(outcome);
          })
          .catch((error) => {
            outcomes.push({
              status: "error",
              fieldName: part.fieldName,
              originalName: part.name,
              reason: error instanceof HttpError ? error.message : "Upload failed",
            });
          });
        inFlight.push(task);
      },
    );

    // Busboy enforces `limits.fileSize` per part. The per-type limit in env
    // is wired here; busboy emits a `limit` event on the file stream when
    // a single file overshoots, which `pipeFileToDestination` maps to 413.

    busboy.on("finish", () => {
      void Promise.all(inFlight).then(() => {
        if (res.writableEnded || res.headersSent) return;
        const okCount = outcomes.filter((o) => o.status === "ok").length;
        res.json({
          results: outcomes,
          summary: { total: outcomes.length, ok: okCount },
          mediaType,
          jellyfinRefresh: okCount > 0 ? "queued" : "skipped",
        });
      });
    });

    busboy.on("error", (err: Error) => {
      if (res.writableEnded || res.headersSent) return;
      const status = err instanceof HttpError ? err.statusCode : 500;
      const message = err instanceof Error ? err.message : "Upload failed";
      console.warn(`[upload] ${mediaType} busboy error:`, err);
      res.status(status).json({ error: message });
    });

    let aborted = false;
    req.on("close", () => {
      if (aborted) return;
      // `req.complete` is true once Node has finished reading the request
      // body. Busboy's `finish` only fires after the body is fully consumed,
      // so any close that arrives while the body is still streaming is a
      // genuine client abort. Any close that arrives after `complete` is
      // true is just the normal socket tear-down post-response and must be
      // ignored — otherwise we race the success path and 499 a finished
      // upload.
      if (req.complete) return;
      aborted = true;
      // Mark the response as ended before destroying busboy so any
      // asynchronous error emitted by the busboy Multipart sub-stream
      // during its own cleanup (e.g. "Unexpected end of file" when the
      // client socket got RST mid-upload) is seen as already-handled by
      // the error handler below and doesn't try to write to a closed
      // socket. The error still surfaces in server logs via the
      // `console.warn` we added to `busboy.on("error")`.
      if (!res.headersSent) {
        // 499 is the unofficial "Client Closed Request" — keeps the cause
        // visible in logs without being a real HTTP status.
        res.status(499).json({ error: "Upload aborted by client" });
      }
      busboy.destroy();
    });

    req.pipe(busboy);
  };
}