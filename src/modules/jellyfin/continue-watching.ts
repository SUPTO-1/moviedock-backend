import {
  getJellyfinItems,
  getJellyfinSeriesEpisodes,
  type MediaCatalogItem,
} from "./jellyfin-client";

export const CONTINUE_WATCHING_DAYS = 15;
const TICKS_PER_SECOND = 10_000_000;
const DEFAULT_LIMIT = 20;
const NEARLY_COMPLETE_PERCENT = 99.5;

export type ContinueWatchingEpisode = {
  id: string;
  seasonNumber?: number;
  episodeNumber?: number;
  title?: string;
};

export type ContinueWatchingItem = {
  media: MediaCatalogItem;
  episode?: ContinueWatchingEpisode;
  progress?: number;
  playbackPositionTicks?: number;
  lastPlayedDate?: string;
  remainingMinutes?: number;
};

function toEpoch(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

export function isWithinContinueWatchingWindow(
  lastPlayedDate: string | undefined,
  now: number = Date.now(),
): boolean {
  const playedAt = toEpoch(lastPlayedDate);
  if (playedAt === undefined) return false;
  const cutoff = now - CONTINUE_WATCHING_DAYS * 24 * 60 * 60 * 1000;
  return playedAt >= cutoff;
}

export function isPartiallyWatched(
  item: Pick<MediaCatalogItem, "progress" | "isPlayed">,
): boolean {
  if (item.isPlayed === true) return false;
  const progress = item.progress;
  if (typeof progress !== "number" || !Number.isFinite(progress)) return false;
  return progress > 0 && progress < NEARLY_COMPLETE_PERCENT;
}

export function isEligibleForContinueWatching(
  item: MediaCatalogItem,
  now: number = Date.now(),
): boolean {
  if (!isPartiallyWatched(item)) return false;
  return isWithinContinueWatchingWindow(item.lastPlayedDate, now);
}

export function compareByLastPlayedDesc(
  a: { lastPlayedDate?: string },
  b: { lastPlayedDate?: string },
): number {
  const aTime = toEpoch(a.lastPlayedDate) ?? 0;
  const bTime = toEpoch(b.lastPlayedDate) ?? 0;
  return bTime - aTime;
}

function computeRemainingMinutes(
  runtimeTicks: number | undefined,
  playbackPositionTicks: number | undefined,
): number | undefined {
  if (
    typeof runtimeTicks !== "number" ||
    typeof playbackPositionTicks !== "number" ||
    runtimeTicks <= 0 ||
    playbackPositionTicks < 0
  ) {
    return undefined;
  }
  const remainingTicks = Math.max(runtimeTicks - playbackPositionTicks, 0);
  return Math.ceil(remainingTicks / TICKS_PER_SECOND / 60);
}

function toEpisodeMeta(item: MediaCatalogItem): ContinueWatchingEpisode {
  return {
    id: item.id,
    seasonNumber: item.parentIndexNumber,
    episodeNumber: item.indexNumber,
    title: item.title,
  };
}

function buildFromMedia(media: MediaCatalogItem): ContinueWatchingItem {
  return {
    media,
    progress: media.progress,
    playbackPositionTicks: media.playbackPositionTicks,
    lastPlayedDate: media.lastPlayedDate,
    remainingMinutes: computeRemainingMinutes(media.runtimeTicks, media.playbackPositionTicks),
  };
}

function buildSeriesItem(series: MediaCatalogItem, episode: MediaCatalogItem): ContinueWatchingItem {
  return {
    media: series,
    episode: toEpisodeMeta(episode),
    progress: episode.progress,
    playbackPositionTicks: episode.playbackPositionTicks,
    lastPlayedDate: episode.lastPlayedDate,
    remainingMinutes: computeRemainingMinutes(episode.runtimeTicks, episode.playbackPositionTicks),
  };
}

async function resolveSeries(
  series: MediaCatalogItem,
  now: number,
): Promise<ContinueWatchingItem | null> {
  let episodes: MediaCatalogItem[];
  try {
    episodes = await getJellyfinSeriesEpisodes(series.id);
  } catch {
    return null;
  }

  const latest = episodes
    .filter((episode) => isEligibleForContinueWatching(episode, now))
    .sort(compareByLastPlayedDesc)[0];

  if (!latest) return null;
  return buildSeriesItem(series, latest);
}

export async function getContinueWatchingItems(
  limit: number = DEFAULT_LIMIT,
): Promise<ContinueWatchingItem[]> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_LIMIT;
  const now = Date.now();

  const catalog = await getJellyfinItems(500, "all");

  const eligibleMovies = catalog
    .filter((item) => item.type === "movie")
    .filter((item) => isEligibleForContinueWatching(item, now))
    .map(buildFromMedia);

  const seriesItems = catalog.filter(
    (item) => item.type === "series" || item.type === "anime",
  );

  const seriesResults = await Promise.all(
    seriesItems.map((series) => resolveSeries(series, now)),
  );
  const eligibleSeries = seriesResults.filter(
    (entry): entry is ContinueWatchingItem => entry !== null,
  );

  return [...eligibleMovies, ...eligibleSeries]
    .sort(compareByLastPlayedDesc)
    .slice(0, safeLimit);
}
