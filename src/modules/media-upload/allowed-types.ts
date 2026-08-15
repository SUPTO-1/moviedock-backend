/**
 * Per-media-type allowlist of MIME types and extensions the uploader will
 * accept.
 *
 * The MIME check is *lenient* — a file is accepted when either the browser
 * reports an allowlisted MIME, OR the browser sends no/empty MIME and the
 * extension is allowlisted. Browsers routinely report `application/octet-stream`
 * or empty MIME for less-common formats (MKV, M4V, HEIC) on desktop and mobile
 * even though the file is plainly the right kind. A strict MIME×ext AND check
 * would reject these legitimate uploads; the extension alone is sufficient
 * because `sanitizeFilename` already strips anything outside the filename
 * allowlist, and we never trust the client's content type to pick the write
 * path.
 *
 * The lists are deliberately small and conservative; Jellyfin accepts a wider
 * set on read, but for the upload path we only need to cover what users
 * realistically select from their phone gallery today.
 */
export type MediaType = "photo" | "movie" | "series" | "anime";

type MediaTypeConfig = {
  /** Human-readable label used in error messages and the UI. */
  label: string;
  /** Lowercase mime types we accept. */
  mimes: ReadonlySet<string>;
  /** Lowercase file extensions (without leading dot) we accept. */
  extensions: ReadonlySet<string>;
};

const PHOTO_MIMES = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/avif",
  // Browsers often report `application/octet-stream` for HEIC/AVIF when they
  // don't know the format — accept it explicitly so the extension check
  // doesn't have to carry the whole load.
  "application/octet-stream",
]);

const PHOTO_EXTS = new Set<string>(["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "avif"]);

const VIDEO_MIMES = new Set<string>([
  "video/mp4",
  "video/webm",
  "video/x-matroska",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-m4v",
  // Browsers report `application/octet-stream` for MKV, M4V, and other
  // containers they don't recognise as video. Accept it so the extension
  // check is what gates the upload.
  "application/octet-stream",
]);

const VIDEO_EXTS = new Set<string>(["mp4", "webm", "mkv", "mov", "avi", "m4v"]);

const VIDEO_CONFIG: MediaTypeConfig = {
  label: "video",
  mimes: VIDEO_MIMES,
  extensions: VIDEO_EXTS,
};

export const MEDIA_TYPE_CONFIG: Record<MediaType, MediaTypeConfig> = {
  photo: {
    label: "photo",
    mimes: PHOTO_MIMES,
    extensions: PHOTO_EXTS,
  },
  movie: { ...VIDEO_CONFIG, label: "movie" },
  series: { ...VIDEO_CONFIG, label: "series" },
  anime: { ...VIDEO_CONFIG, label: "anime" },
};

/**
 * Accept the file when the browser reports an allowlisted MIME. Empty /
 * undefined MIME is intentionally accepted here — the extension check below
 * is the real gate.
 */
export function isAllowedMime(mediaType: MediaType, mime: string | undefined): boolean {
  if (!mime) return true;
  return MEDIA_TYPE_CONFIG[mediaType].mimes.has(mime.toLowerCase());
}

export function isAllowedExtension(mediaType: MediaType, extension: string | undefined): boolean {
  if (!extension) return false;
  return MEDIA_TYPE_CONFIG[mediaType].extensions.has(extension.toLowerCase());
}
