import { env } from "../../app/config/env";
import { HttpError } from "../../app/errors/http-error";

type JellyfinPublicSystemInfo = {
  ServerName: string;
  Version: string;
  OperatingSystem: string;
  Id: string;
};

type JellyfinItemType = "movie" | "series" | "anime" | "music" | "photo";

type JellyfinUserItem = {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  RunTimeTicks?: number;
  Overview?: string;
  Genres?: string[];
  OfficialRating?: string;
  ImageTags?: {
    Primary?: string;
    Backdrop?: string;
  };
  UserData?: {
    PlaybackPositionTicks?: number;
    PlayedPercentage?: number;
    LastPlayedDate?: string;
    Played?: boolean;
  };
  MediaSources?: Array<{
    Id?: string;
    Container?: string;
    Size?: number;
    IsRemote?: boolean;
  }>;
  ParentId?: string;
  Path?: string;
};

type JellyfinUserItemsResponse = {
  Items: JellyfinUserItem[];
  TotalRecordCount: number;
};

type JellyfinUser = {
  Id: string;
  Name: string;
  ServerId?: string;
};

type JellyfinQueryResult<T> = {
  Items: T[];
  TotalRecordCount?: number;
  StartIndex?: number;
};

type JellyfinBaseItem = {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  RunTimeTicks?: number;
  Overview?: string;
  Genres?: string[];
  OfficialRating?: string;
  CommunityRating?: number;
  People?: Array<{
    Id?: string;
    Name?: string;
    Role?: string;
    Type?: string;
    PrimaryImageTag?: string;
  }>;
  ImageTags?: {
    Primary?: string;
    Backdrop?: string;
  };
  MediaSources?: Array<{
    Id?: string;
    Container?: string;
    Size?: number;
    IsRemote?: boolean;
    MediaStreams?: JellyfinMediaStream[];
  }>;
  UserData?: {
    PlaybackPositionTicks?: number;
    PlayedPercentage?: number;
    LastPlayedDate?: string;
    Played?: boolean;
  };
  SeriesName?: string;
  SeasonName?: string;
  Status?: string;
  Studios?: Array<{ Name?: string }>;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  ParentId?: string;
  Path?: string;
  SeriesId?: string;
  SeasonId?: string;
};

type JellyfinMediaStream = {
  Index: number;
  Type: "Video" | "Audio" | "Subtitle";
  Language?: string;
  DisplayLanguage?: string;
  Codec?: string;
  Channels?: number;
  BitRate?: number;
  IsDefault?: boolean;
  IsForced?: boolean;
  IsExternal?: boolean;
  Title?: string;
};

export type MediaCatalogItem = {
  id: string;
  title: string;
  type: JellyfinItemType;
  posterUrl: string;
  backdropUrl: string;
  year: number;
  duration: string;
  rating: string;
  genres: string[];
  overview: string;
  progress?: number;
  playbackPositionTicks?: number;
  lastPlayedDate?: string;
  isPlayed?: boolean;
  runtimeTicks?: number;
  resolution?: string;
  quality?: string;
  playbackUrl?: string;
  mediaSourceCount?: number;
  mediaStreams?: Array<{
    index: number;
    type: "Video" | "Audio" | "Subtitle";
    language?: string;
    displayLanguage?: string;
    codec?: string;
    channels?: number;
    bitRate?: number;
    isDefault?: boolean;
    isForced?: boolean;
    isExternal?: boolean;
    title?: string;
  }>;
  cast?: Array<{
    id: string;
    name: string;
    role?: string;
    type?: string;
    imageUrl?: string;
  }>;
  seriesName?: string;
  seriesId?: string;
  seasonName?: string;
  status?: string;
  communityRating?: number;
  indexNumber?: number;
  parentIndexNumber?: number;
};

const OFFLINE_MEDIA_TITLE = "Jellyfin unavailable";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: string | URL, init: RequestInit = {}, timeoutMs = 2000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function fetchWithLongTimeout(input: string | URL, init: RequestInit = {}, timeoutMs = 8000) {
  return fetchWithTimeout(input, init, timeoutMs);
}

function createOfflineMediaItem(id: string): MediaCatalogItem {
  return {
    id,
    title: OFFLINE_MEDIA_TITLE,
    type: "movie",
    posterUrl: "/api/jellyfin/images/offline/poster",
    backdropUrl: "/api/jellyfin/images/offline/backdrop",
    year: new Date().getFullYear(),
    duration: "Unknown",
    rating: "NR",
    genres: [],
    overview: "Jellyfin could not be reached. The app is still running in fallback mode.",
    resolution: "Unknown",
    quality: "OFFLINE",
    playbackUrl: `/api/jellyfin/play/${encodeURIComponent(id)}`,
  };
}

function logMediaSummary(label: string, item: JellyfinBaseItem) {
  const cast = item.People?.slice(0, 8).map((person) => ({ name: person.Name ?? "Unknown", role: person.Role ?? undefined, type: person.Type ?? undefined })) ?? [];
  const studioNames = item.Studios?.map((studio) => studio.Name).filter((name): name is string => Boolean(name)) ?? [];

  console.info(
    `[Jellyfin] ${label}:`,
    JSON.stringify(
      {
        id: item.Id,
        name: item.Name,
        type: item.Type,
        year: item.ProductionYear,
        genres: item.Genres ?? [],
        rating: item.OfficialRating ?? "NR",
        communityRating: item.CommunityRating ?? null,
        status: item.Status ?? null,
        seriesName: item.SeriesName ?? null,
        seasonName: item.SeasonName ?? null,
        indexNumber: item.IndexNumber ?? null,
        parentIndexNumber: item.ParentIndexNumber ?? null,
        mediaSources: item.MediaSources?.length ?? 0,
        cast,
        studios: studioNames,
      },
      null,
      2,
    ),
  );
}

function createOfflineImage(kind: "primary" | "backdrop") {
  const label = kind === "backdrop" ? "Jellyfin unavailable" : "Offline";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-label="${label}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="100%" stop-color="#111827" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#fb7185" stop-opacity="0.35" />
          <stop offset="100%" stop-color="#fb7185" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)" />
      <rect width="1280" height="720" fill="url(#glow)" />
      <g fill="none" stroke="#f8fafc" stroke-opacity="0.18">
        <path d="M96 624h1088" />
        <path d="M96 160h1088" />
        <path d="M96 160v464" />
        <path d="M1184 160v464" />
      </g>
      <g fill="#f8fafc" fill-opacity="0.95" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">
        <text x="640" y="312" font-size="58" font-weight="700">${label}</text>
        <text x="640" y="372" font-size="26" fill-opacity="0.72">MovieDock is running without Jellyfin</text>
      </g>
    </svg>
  `;

  return {
    buffer: Buffer.from(svg.trim()),
    contentType: "image/svg+xml",
  };
}

function createMissingArtworkImage(kind: "primary" | "backdrop") {
  const label = kind === "backdrop" ? "Backdrop not available" : "Artwork not available";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-label="${label}">
      <defs>
        <linearGradient id="bg-missing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#111827" />
          <stop offset="100%" stop-color="#1f2937" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg-missing)" />
      <g fill="#e5e7eb" fill-opacity="0.78" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">
        <text x="640" y="334" font-size="44" font-weight="700">${label}</text>
      </g>
    </svg>
  `;

  return {
    buffer: Buffer.from(svg.trim()),
    contentType: "image/svg+xml",
  };
}

function buildAuthorizationHeader() {
  if (!env.jellyfinApiKey) {
    throw new HttpError(500, "JELLYFIN_API_KEY is required to fetch media data");
  }

  return `MediaBrowser Client="${env.jellyfinDeviceName}", Device="${env.jellyfinDeviceName}", DeviceId="${env.jellyfinDeviceId}", Version="1.0.0", Token="${env.jellyfinApiKey}"`;
}

async function requestJson<T>(path: string): Promise<T> {
  const url = new URL(path, env.jellyfinUrl);
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: buildAuthorizationHeader(),
  };

  const response = await fetchWithTimeout(url, { headers });

  if (!response.ok) {
    throw new HttpError(response.status, `Jellyfin request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function requestBuffer(path: string): Promise<{ buffer: Buffer; contentType: string | null }> {
  const url = new URL(path, env.jellyfinUrl);
  const headers: Record<string, string> = {
    Authorization: buildAuthorizationHeader(),
  };

  const response = await fetchWithTimeout(url, { headers });

  if (!response.ok) {
    throw new HttpError(response.status, `Jellyfin request failed: ${response.status} ${response.statusText}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type"),
  };
}

async function requestRawJson<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}

async function requestPublicHealth(): Promise<JellyfinPublicSystemInfo> {
  const url = new URL("/System/Info/Public", env.jellyfinUrl);
  const response = await fetchWithLongTimeout(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new HttpError(response.status, `Jellyfin request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as JellyfinPublicSystemInfo;
}

export async function waitForJellyfinConnection(retries = 5) {
  console.log(`[Jellyfin] Probing ${env.jellyfinUrl} (timeout 2s per attempt)...`);

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await requestPublicHealth();
      console.log(`[Jellyfin] Connected on attempt ${attempt}/${retries}`);
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      console.warn(`[Jellyfin] Attempt ${attempt}/${retries} failed: ${reason}`);

      if (attempt < retries) {
        await sleep(1000);
      }
    }
  }

  console.warn(
    `[Jellyfin] Unavailable after ${retries} retries. Starting in fallback mode.\n` +
      `        → Check that Jellyfin is running and reachable at ${env.jellyfinUrl}\n` +
      `        → Update JELLYFIN_URL in src/.env if the IP/port has changed.`,
  );
  return false;
}

export async function getActiveUserId() {
  const users = await requestRawJson<JellyfinUser[]>("/Users");
  const firstUser = users[0];

  if (!firstUser) {
    throw new HttpError(404, "No Jellyfin users were found");
  }

  return firstUser.Id;
}

type JellyfinLibraryFolder = {
  ItemId: string;
  Name: string;
  CollectionType?: string;
  Path?: string;
};

let animeLibraryIdsCache: Set<string> | null = null;

function isAnimeLibraryName(name: string) {
  return /anime/i.test(name);
}

async function fetchAnimeLibraryIds(): Promise<Set<string>> {
  const userId = await getActiveUserId();
  const response = await requestJson<{ Items: JellyfinLibraryFolder[] }>(
    `/Library/MediaFolders?userId=${encodeURIComponent(userId)}`,
  );

  const ids = new Set(
    response.Items.filter((folder) => isAnimeLibraryName(folder.Name)).map((folder) => folder.ItemId),
  );

  console.info(`[Jellyfin] Anime library ids: ${[...ids].join(", ") || "(none)"}`);
  return ids;
}

async function getAnimeLibraryIds(): Promise<Set<string>> {
  if (animeLibraryIdsCache) {
    return animeLibraryIdsCache;
  }

  try {
    animeLibraryIdsCache = await fetchAnimeLibraryIds();
  } catch {
    animeLibraryIdsCache = new Set();
  }

  return animeLibraryIdsCache;
}

function getImageUrl(itemId: string, kind: "primary" | "backdrop") {
  if (kind === "backdrop") {
    return `/api/jellyfin/images/${itemId}/backdrop`;
  }

  return `/api/jellyfin/images/${itemId}/poster`;
}

function formatRuntime(runTimeTicks?: number) {
  if (!runTimeTicks) {
    return "Unknown";
  }

  const totalMinutes = Math.max(1, Math.round(runTimeTicks / 10_000_000 / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatRating(item: JellyfinUserItem) {
  return item.OfficialRating ?? "NR";
}

function formatResolution(item: JellyfinUserItem) {
  const size = item.MediaSources?.[0]?.Size;

  if (!size) {
    return "HD";
  }

  if (size >= 2_000_000_000) {
    return "4K";
  }

  if (size >= 700_000_000) {
    return "1080p";
  }

  return "720p";
}

function isAnimeGenre(genres?: string[]) {
  return genres?.some((genre) => genre.toLowerCase() === "anime") ?? false;
}

function isAnimePath(path?: string) {
  return path ? /[\\/]anime[\\/]/i.test(path) : false;
}

function mapItemType(item: JellyfinUserItem, animeLibraryIds: Set<string>): JellyfinItemType {
  const isAnime =
    isAnimeGenre(item.Genres) ||
    (item.ParentId !== undefined && animeLibraryIds.has(item.ParentId)) ||
    isAnimePath(item.Path);

  if (item.Type === "Series") {
    return isAnime ? "anime" : "series";
  }

  if (item.Type === "Movie") {
    return isAnime ? "anime" : "movie";
  }

  return "movie";
}

function mapToCatalogItem(item: JellyfinBaseItem, type: JellyfinItemType): MediaCatalogItem {
  const primaryMediaSource = item.MediaSources?.find((source) => !source.IsRemote) ?? item.MediaSources?.[0];
  const cast = item.People?.slice(0, 8).map((person) => ({
    id: person.Id ?? `${item.Id}-${person.Name ?? "unknown"}`,
    name: person.Name ?? "Unknown",
    role: person.Role,
    type: person.Type,
    imageUrl: person.Id ? `/api/jellyfin/images/${encodeURIComponent(person.Id)}/primary` : undefined,
  })) ?? [];
  const mediaStreams = primaryMediaSource?.MediaStreams?.map((stream) => ({
    index: stream.Index,
    type: stream.Type,
    language: stream.Language,
    displayLanguage: stream.DisplayLanguage,
    codec: stream.Codec,
    channels: stream.Channels,
    bitRate: stream.BitRate,
    isDefault: stream.IsDefault,
    isForced: stream.IsForced,
    isExternal: stream.IsExternal,
    title: stream.Title,
  }));

  return {
    id: item.Id,
    title: item.Name,
    type,
    posterUrl: getImageUrl(item.Id, "primary"),
    backdropUrl: getImageUrl(item.Id, "backdrop"),
    year: item.ProductionYear ?? new Date().getFullYear(),
    duration: formatRuntime(item.RunTimeTicks),
    rating: formatRating(item),
    genres: item.Genres ?? [],
    overview: item.Overview ?? "No description available.",
    progress: item.UserData?.PlayedPercentage,
    playbackPositionTicks: item.UserData?.PlaybackPositionTicks,
    lastPlayedDate: item.UserData?.LastPlayedDate,
    isPlayed: item.UserData?.Played,
    runtimeTicks: item.RunTimeTicks,
    resolution: formatResolution(item),
    quality: item.MediaSources?.[0]?.Container?.toUpperCase(),
    mediaSourceCount: item.MediaSources?.length ?? 0,
    mediaStreams,
    cast,
    seriesName: item.SeriesName,
    seriesId: item.SeriesId,
    seasonName: item.SeasonName,
    status: item.Status,
    communityRating: item.CommunityRating,
    indexNumber: item.IndexNumber,
    parentIndexNumber: item.ParentIndexNumber,
  };
}

export async function getJellyfinHealth() {
  // First try the cheap public endpoint. If that hangs (slow proxy / cold start),
  // fall back to a tiny authenticated probe to confirm Jellyfin itself is alive.
  try {
    const info = await requestPublicHealth();
    console.info(`[Jellyfin] Health: OK (${info.ServerName} ${info.Version}) at ${env.jellyfinUrl}`);
    return {
      connected: true,
      jellyfinUrl: env.jellyfinUrl,
      serverName: info.ServerName,
      version: info.Version,
      operatingSystem: info.OperatingSystem,
      serverId: info.Id,
    };
  } catch (publicError) {
    const reason = publicError instanceof Error ? publicError.message : "Unknown error";
    console.warn(`[Jellyfin] /System/Info/Public failed: ${reason}. Trying authenticated probe…`);

    try {
      await requestJson<unknown>("/System/Info");
      console.info(`[Jellyfin] Health: OK via authenticated probe at ${env.jellyfinUrl}`);
      return {
        connected: true,
        jellyfinUrl: env.jellyfinUrl,
        serverName: env.jellyfinDeviceName ?? "Jellyfin",
        version: "unknown",
        operatingSystem: "unknown",
        serverId: "unknown",
      };
    } catch (authError) {
      const authReason = authError instanceof Error ? authError.message : "Unknown error";
      console.warn(`[Jellyfin] Health: unavailable at ${env.jellyfinUrl} (${authReason})`);
      return {
        connected: false,
        jellyfinUrl: env.jellyfinUrl,
        serverName: OFFLINE_MEDIA_TITLE,
        version: "offline",
        operatingSystem: "offline",
        serverId: "offline",
      };
    }
  }
}

type JellyfinCollectionType = "all" | "movie" | "series" | "anime";

export async function getJellyfinItems(limit = 20, collectionType: JellyfinCollectionType = "all") {
  try {
    const userId = await getActiveUserId();
    const includeItemTypes = collectionType === "movie" ? "Movie" : collectionType === "series" ? "Series" : "Movie,Series";

    const searchParams = new URLSearchParams({
      userId,
      recursive: "true",
      includeItemTypes: includeItemTypes,
      sortBy: "DateCreated",
      sortOrder: "Descending",
      limit: String(limit),
      fields: "PrimaryImageAspectRatio,Overview,Genres,ProductionYear,RunTimeTicks,MediaSources,MediaStreams,UserData,OfficialRating,ParentId,Path",
      enableUserData: "true",
      enableImages: "true",
    });

    const [response, animeLibraryIds] = await Promise.all([
      requestJson<JellyfinUserItemsResponse>(`/Items?${searchParams.toString()}`),
      getAnimeLibraryIds(),
    ]);

    const items = response.Items.map((item) => mapToCatalogItem(item, mapItemType(item, animeLibraryIds)));

    console.info(
      `[Jellyfin] Items (${collectionType}, ${items.length}/${response.TotalRecordCount ?? items.length}):`,
      items.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        year: item.year,
        genres: item.genres,
        mediaSources: item.mediaSourceCount ?? 0,
        progress: item.progress ?? null,
        status: item.status ?? null,
      })),
    );

    if (collectionType === "movie") {
      // "movie" tab includes both regular movies AND anime movies.
      return items.filter((item) => item.type === "movie");
    }

    if (collectionType === "series") {
      // "series" tab includes both regular series AND anime series.
      return items.filter((item) => item.type === "series");
    }

    if (collectionType === "anime") {
      return items.filter((item) => item.type === "anime");
    }

    return items;
  } catch {
    return [createOfflineMediaItem("jellyfin-offline")];
  }
}

export async function getJellyfinItemById(id: string) {
  try {
    const userId = await getActiveUserId();
    const animeLibraryIds = await getAnimeLibraryIds();
    const item = await requestJson<JellyfinBaseItem>(
      `/Items/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}&fields=Overview,Genres,ProductionYear,RunTimeTicks,MediaSources,MediaStreams,UserData,OfficialRating,CommunityRating,Studios,People,ParentId,SeriesId,SeasonId,IndexNumber,ParentIndexNumber,Status,SeriesName,SeasonName,Path`,
    );

    logMediaSummary("Item", item);

    return {
      ...mapToCatalogItem(item, mapItemType(item, animeLibraryIds)),
      playbackUrl: `/api/jellyfin/play/${encodeURIComponent(id)}`,
    };
  } catch {
    return createOfflineMediaItem(id);
  }
}

type PlaybackProgressPayload = {
  itemId: string;
  positionTicks?: number;
  mediaSourceId?: string;
  playSessionId?: string;
  canSeek?: boolean;
  playMethod?: string;
  isPaused?: boolean;
  isMuted?: boolean;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  volumeLevel?: number;
  liveStreamId?: string;
  repeatMode?: string;
};

type PlaybackStopPayload = {
  itemId: string;
  positionTicks?: number;
  mediaSourceId?: string;
  playSessionId?: string;
  liveStreamId?: string;
  nextMediaType?: string;
};

async function postJson(path: string, body: object) {
  const url = new URL(path, env.jellyfinUrl);
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: buildAuthorizationHeader(),
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new HttpError(response.status, `Jellyfin request failed: ${response.status} ${response.statusText}`);
  }
}

export async function reportJellyfinPlaybackStart(payload: PlaybackProgressPayload) {
  await postJson("/Sessions/Playing", payload);
}

export async function reportJellyfinPlaybackProgress(payload: PlaybackProgressPayload) {
  await postJson("/Sessions/Playing/Progress", payload);
}

export async function reportJellyfinPlaybackStopped(payload: PlaybackStopPayload) {
  await postJson("/Sessions/Playing/Stopped", payload);
}

export async function resolveJellyfinPlaybackSource(id: string) {
  const item = await requestJson<JellyfinBaseItem>(
    `/Items/${encodeURIComponent(id)}?userId=${encodeURIComponent(await getActiveUserId())}&fields=SeriesId,Type,MediaSources`,
  );

  if (item.Type === "Series") {
    const episodes = await requestJson<JellyfinQueryResult<JellyfinBaseItem>>(
      `/Shows/${encodeURIComponent(id)}/Episodes?limit=1&sortBy=SortName&fields=Overview,Genres,ProductionYear,RunTimeTicks,MediaSources,MediaStreams,UserData,OfficialRating,CommunityRating,Studios,ParentId,SeriesId,SeasonId,IndexNumber,ParentIndexNumber,Status,SeriesName,SeasonName`,
    );

    const firstEpisode = episodes.Items[0];
    if (firstEpisode) {
      logMediaSummary("Playback target (series -> first episode)", firstEpisode);
      return {
        itemId: firstEpisode.Id,
        mediaSourceId: firstEpisode.MediaSources?.[0]?.Id,
      };
    }
  }

  logMediaSummary("Playback target", item);
  return {
    itemId: item.Id,
    mediaSourceId: item.MediaSources?.[0]?.Id,
  };
}

export async function getJellyfinSeriesEpisodes(seriesId: string) {
  const userId = await getActiveUserId();
  const animeLibraryIds = await getAnimeLibraryIds();
  const response = await requestJson<JellyfinQueryResult<JellyfinBaseItem>>(
    `/Shows/${encodeURIComponent(seriesId)}/Episodes?userId=${encodeURIComponent(userId)}&fields=Overview,Genres,ProductionYear,RunTimeTicks,MediaSources,MediaStreams,UserData,OfficialRating,CommunityRating,Studios,People,ParentId,SeriesId,SeasonId,IndexNumber,ParentIndexNumber,Status,SeriesName,SeasonName,Path&sortBy=AiredEpisodeOrder&sortOrder=Ascending&enableImages=true&enableUserData=true`,
  );

  const episodes = response.Items.map((episode) => ({
    ...mapToCatalogItem(episode, mapItemType(episode, animeLibraryIds)),
    playbackUrl: `/api/jellyfin/play/${encodeURIComponent(episode.Id)}`,
  }));

  console.info(
    `[Jellyfin] Episodes for series ${seriesId} (${episodes.length}):`,
    episodes.map((episode) => ({
      id: episode.id,
      title: episode.title,
      seasonName: episode.seasonName ?? null,
      indexNumber: episode.indexNumber ?? null,
      parentIndexNumber: episode.parentIndexNumber ?? null,
      progress: episode.progress ?? null,
    })),
  );

  return episodes;
}

export function buildJellyfinPlaybackUrl(
  playbackItemId: string,
  options: { audioStreamIndex?: number; subtitleStreamIndex?: number; mediaSourceId?: string } = {},
) {
  // `static=true` flips Jellyfin to a direct remux/stream instead of a fragmented
  // fMP4 manifest. This is required for HTML5 <video> to send Range requests and
  // seek freely through the file. Without it, MKV-source episodes only play
  // ~15-20s because the browser can't determine the duration.
  const url = new URL(`/Videos/${encodeURIComponent(playbackItemId)}/stream.mp4`, env.jellyfinUrl);
  url.searchParams.set("ApiKey", env.jellyfinApiKey);
  url.searchParams.set("static", "true");
  // `MediaSourceId` is required by Jellyfin when `AudioStreamIndex` /
  // `SubtitleStreamIndex` are passed — otherwise the server silently ignores
  // the track selection and serves the default audio.
  if (options.mediaSourceId) {
    url.searchParams.set("MediaSourceId", options.mediaSourceId);
  }
  if (typeof options.audioStreamIndex === "number") {
    url.searchParams.set("AudioStreamIndex", String(options.audioStreamIndex));
  }
  if (typeof options.subtitleStreamIndex === "number") {
    url.searchParams.set("SubtitleStreamIndex", String(options.subtitleStreamIndex));
  }
  return url.toString();
}

export async function searchJellyfinItems(query: string, limit = 30) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const userId = await getActiveUserId();
  const animeLibraryIds = await getAnimeLibraryIds();

  const buildParams = (params: Record<string, string>) => {
    const sp = new URLSearchParams({
      userId,
      recursive: "true",
      includeItemTypes: "Movie,Series",
      sortBy: "SortName",
      sortOrder: "Ascending",
      limit: String(limit),
      fields: "PrimaryImageAspectRatio,Overview,Genres,ProductionYear,RunTimeTicks,MediaSources,UserData,OfficialRating,ParentId,Path",
      enableUserData: "true",
      enableImages: "true",
      ...params,
    });
    return sp;
  };

  const mapResults = (response: JellyfinUserItemsResponse) =>
    response.Items.map((item) => mapToCatalogItem(item, mapItemType(item, animeLibraryIds)));

  // Primary search using Jellyfin's `searchTerm` (matches anywhere in the
  // title or any text field).
  const primaryParams = buildParams({ searchTerm: trimmed });
  const primaryResponse = await requestJson<JellyfinUserItemsResponse>(`/Items?${primaryParams.toString()}`);
  const primaryItems = mapResults(primaryResponse);

  if (primaryItems.length > 0) {
    return primaryItems;
  }

  // Fallback for single-token queries: Jellyfin's `searchTerm` is a strict
  // token match, so typing "avenger" returns nothing even though "Avengers
  // Endgame" is in the library. `NameStartsWith` widens the match without
  // being as noisy as a generic `Contains` (which would match every title
  // that contains the letters).
  if (!/\s/.test(trimmed)) {
    try {
      const fallbackParams = buildParams({ NameStartsWith: trimmed });
      const fallbackResponse = await requestJson<JellyfinUserItemsResponse>(
        `/Items?${fallbackParams.toString()}`,
      );
      return mapResults(fallbackResponse);
    } catch {
      // Swallow — fall through to the empty primary result.
    }
  }

  return primaryItems;
}

export async function refreshJellyfinLibrary() {
  const url = new URL("/Library/Refresh", env.jellyfinUrl);
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: buildAuthorizationHeader(),
    },
  });

  if (!response.ok) {
    throw new HttpError(response.status, `Jellyfin library refresh failed: ${response.status} ${response.statusText}`);
  }

  // Bust the anime-library cache so newly added libraries are detected.
  animeLibraryIdsCache = null;

  console.info(`[Jellyfin] Library refresh requested at ${env.jellyfinUrl}`);
  return { ok: true };
}

export async function getJellyfinImage(itemId: string, kind: "primary" | "backdrop") {
  const path = kind === "backdrop" ? `/Items/${encodeURIComponent(itemId)}/Images/Backdrop/0` : `/Items/${encodeURIComponent(itemId)}/Images/Primary`;

  try {
    return await requestBuffer(path);
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 404) {
      if (kind === "backdrop") {
        try {
          return await requestBuffer(`/Items/${encodeURIComponent(itemId)}/Images/Primary`);
        } catch {
          return createMissingArtworkImage(kind);
        }
      }

      return createMissingArtworkImage(kind);
    }

    return createOfflineImage(kind);
  }
}
