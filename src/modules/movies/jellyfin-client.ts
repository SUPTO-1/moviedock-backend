import { env } from "../../app/config/env.js";
import { HttpError } from "../../app/errors/http-error.js";

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
  };
  MediaSources?: Array<{
    Container?: string;
    Size?: number;
    IsRemote?: boolean;
  }>;
};

type JellyfinUserItemsResponse = {
  Items: JellyfinUserItem[];
  TotalRecordCount: number;
};

type JellyfinViewsResponse = {
  Items: Array<{
    Id: string;
    Name: string;
    CollectionType?: string;
    Etag?: string;
  }>;
  TotalRecordCount: number;
};

type JellyfinUser = {
  Id: string;
  Name: string;
  ServerId?: string;
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
  resolution?: string;
  quality?: string;
};

export type MediaCatalogSection = {
  id: string;
  title: string;
  type: string;
};

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

  const response = await fetch(url, { headers });

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

  const response = await fetch(url, { headers });

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

async function getActiveUserId() {
  const users = await requestRawJson<JellyfinUser[]>("/Users");
  const firstUser = users[0];

  if (!firstUser) {
    throw new HttpError(404, "No Jellyfin users were found");
  }

  return firstUser.Id;
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

function mapItemType(item: JellyfinUserItem): JellyfinItemType {
  if (item.Type === "Series") {
    return item.Genres?.some((genre) => genre.toLowerCase() === "anime") ? "anime" : "series";
  }

  if (item.Type === "Movie") {
    return item.Genres?.some((genre) => genre.toLowerCase() === "anime") ? "anime" : "movie";
  }

  return "movie";
}

function mapToCatalogItem(item: JellyfinUserItem): MediaCatalogItem {
  return {
    id: item.Id,
    title: item.Name,
    type: mapItemType(item),
    posterUrl: getImageUrl(item.Id, "primary"),
    backdropUrl: getImageUrl(item.Id, "backdrop"),
    year: item.ProductionYear ?? new Date().getFullYear(),
    duration: formatRuntime(item.RunTimeTicks),
    rating: formatRating(item),
    genres: item.Genres ?? [],
    overview: item.Overview ?? "No description available.",
    progress: item.UserData?.PlayedPercentage,
    resolution: formatResolution(item),
    quality: item.MediaSources?.[0]?.Container?.toUpperCase(),
  };
}

export async function getJellyfinHealth() {
  const info = await requestJson<JellyfinPublicSystemInfo>("/System/Info/Public");

  return {
    connected: true,
    jellyfinUrl: env.jellyfinUrl,
    serverName: info.ServerName,
    version: info.Version,
    operatingSystem: info.OperatingSystem,
    serverId: info.Id,
  };
}

export async function getJellyfinSections() {
  const userId = await getActiveUserId();
  const views = await requestJson<JellyfinViewsResponse>(`/UserViews?userId=${encodeURIComponent(userId)}`);

  return views.Items.map((item) => ({
    id: item.Id,
    title: item.Name,
    type: item.CollectionType ?? "library",
  } satisfies MediaCatalogSection));
}

type JellyfinCollectionType = "all" | "movie" | "series" | "anime";

export async function getJellyfinItems(limit = 20, collectionType: JellyfinCollectionType = "all") {
  const userId = await getActiveUserId();
  const includeItemTypes = collectionType === "movie" ? "Movie" : collectionType === "series" ? "Series" : "Movie,Series";

  const searchParams = new URLSearchParams({
    userId,
    recursive: "true",
    includeItemTypes: includeItemTypes,
    sortBy: "DateCreated",
    sortOrder: "Descending",
    limit: String(limit),
    fields: "PrimaryImageAspectRatio,Overview,Genres,ProductionYear,RunTimeTicks,MediaSources,UserData,OfficialRating,MediaStreams",
    enableUserData: "true",
    enableImages: "true",
  });

  const response = await requestJson<JellyfinUserItemsResponse>(`/Items?${searchParams.toString()}`);

  const items = response.Items.map(mapToCatalogItem);

  if (collectionType === "movie") {
    return items.filter((item) => item.type === "movie");
  }

  if (collectionType === "series") {
    return items.filter((item) => item.type === "series");
  }

  if (collectionType === "anime") {
    return items.filter((item) => item.type === "anime");
  }

  return items;
}

export async function getJellyfinItemById(id: string) {
  const userId = await getActiveUserId();
  const item = await requestJson<JellyfinUserItem>(`/Items/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`);

  return mapToCatalogItem(item);
}

export async function getJellyfinImage(itemId: string, kind: "primary" | "backdrop") {
  const path = kind === "backdrop" ? `/Items/${encodeURIComponent(itemId)}/Images/Backdrop/0` : `/Items/${encodeURIComponent(itemId)}/Images/Primary`;

  return requestBuffer(path);
}
