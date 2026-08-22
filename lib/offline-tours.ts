import type {
  PublicExperienceOption,
} from "@/lib/public-experiences";

const OFFLINE_CACHE = "between-stops-offline-v1";
const OFFLINE_STORAGE_KEY = "between-stops-offline-tours-v1";

export type OfflineTourRecord = {
  experienceId: string;
  downloadedAt: string;
  option: PublicExperienceOption;
  sizeBytes: number;
};

type OfflineAsset = {
  sourceUrl: string;
  cacheUrl: string;
};

export function getOfflineTourRecords(): OfflineTourRecord[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(
      localStorage.getItem(OFFLINE_STORAGE_KEY) ?? "[]"
    );
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getOfflineTourOptions() {
  return getOfflineTourRecords().map((record) => record.option);
}

export function formatDownloadSize(bytes?: number) {
  if (!bytes || bytes <= 0) return "Size calculated during download";
  const megabytes = bytes / (1024 * 1024);
  return megabytes < 1
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`;
}

function createOfflineCopy(option: PublicExperienceOption) {
  const assets: OfflineAsset[] = [];
  const urlMap = new Map<string, string>();
  const prefix = `/between-stops-offline-media/${option.experience.id}/`;

  const offlineUrl = (sourceUrl?: string) => {
    if (!sourceUrl) return undefined;
    const existing = urlMap.get(sourceUrl);
    if (existing) return existing;
    const cacheUrl = `${prefix}${urlMap.size + 1}`;
    urlMap.set(sourceUrl, cacheUrl);
    assets.push({ sourceUrl, cacheUrl });
    return cacheUrl;
  };

  const offlineOption: PublicExperienceOption = {
    ...option,
    coverImageUrl: offlineUrl(option.coverImageUrl),
    galleryImageUrls: option.galleryImageUrls.map(
      (url) => offlineUrl(url) as string
    ),
    creator: option.creator
      ? {
          ...option.creator,
          avatarUrl: offlineUrl(option.creator.avatarUrl),
          leftPromptUrl: offlineUrl(option.creator.leftPromptUrl),
          rightPromptUrl: offlineUrl(option.creator.rightPromptUrl),
        }
      : undefined,
    experience: {
      ...option.experience,
      stories: option.experience.stories.map((story) => ({
        ...story,
        audioUrl: offlineUrl(story.audioUrl),
        imageUrl: offlineUrl(story.imageUrl),
      })),
    },
  };

  return { offlineOption, assets };
}

async function cacheAppShell(cache: Cache) {
  const response = await fetch("/tours", { cache: "no-store" });
  if (!response.ok) throw new Error("The offline tour screen could not be saved.");

  const html = await response.clone().text();
  await cache.put("/tours", response);
  const assetPaths = Array.from(
    new Set(
      html.match(/\/_next\/static\/[^"'\s<>]+/g) ?? []
    )
  );

  await Promise.all(
    assetPaths.map(async (path) => {
      try {
        const assetResponse = await fetch(path);
        if (assetResponse.ok) await cache.put(path, assetResponse);
      } catch {
        // The media download remains useful even if a non-essential shell asset fails.
      }
    })
  );

  for (const path of [
    "/branding/between-stops-icon-v2.png",
    "/branding/between-stops-logo.png",
    "/between-stops-sw.js",
  ]) {
    try {
      const assetResponse = await fetch(path);
      if (assetResponse.ok) await cache.put(path, assetResponse);
    } catch {
      // Keep the download available when an optional brand asset fails.
    }
  }
}

export async function downloadTourForOfflineUse(
  option: PublicExperienceOption,
  onProgress: (completed: number, total: number) => void
) {
  if (!("serviceWorker" in navigator) || !("caches" in window)) {
    throw new Error("Offline downloads are not supported by this browser.");
  }

  await navigator.serviceWorker.register("/between-stops-sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  await navigator.serviceWorker.ready;

  const cache = await caches.open(OFFLINE_CACHE);
  const { offlineOption, assets } = createOfflineCopy(option);
  let completed = 0;
  onProgress(completed, assets.length);

  for (const asset of assets) {
    const response = await fetch(asset.sourceUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("One of the tour files could not be downloaded.");
    }
    await cache.put(asset.cacheUrl, response);
    completed += 1;
    onProgress(completed, assets.length);
  }

  await cacheAppShell(cache);

  const nextRecord: OfflineTourRecord = {
    experienceId: option.experience.id,
    downloadedAt: new Date().toISOString(),
    option: offlineOption,
    sizeBytes: option.downloadSizeBytes ?? 0,
  };
  const records = getOfflineTourRecords().filter(
    (record) => record.experienceId !== option.experience.id
  );
  localStorage.setItem(
    OFFLINE_STORAGE_KEY,
    JSON.stringify([...records, nextRecord])
  );

  return nextRecord;
}

export async function removeOfflineTour(experienceId: string) {
  const cache = await caches.open(OFFLINE_CACHE);
  const keys = await cache.keys();
  const prefix = `/between-stops-offline-media/${experienceId}/`;

  await Promise.all(
    keys
      .filter((request) => new URL(request.url).pathname.startsWith(prefix))
      .map((request) => cache.delete(request))
  );

  const records = getOfflineTourRecords().filter(
    (record) => record.experienceId !== experienceId
  );
  localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(records));
}

export function mergeWithOfflineTours(
  onlineOptions: PublicExperienceOption[]
) {
  const offlineOptions = getOfflineTourOptions();

  return [
    ...onlineOptions.map(
      (option) =>
        offlineOptions.find(
          (offline) => offline.experience.id === option.experience.id
        ) ?? option
    ),
    ...offlineOptions.filter(
      (option) =>
        !onlineOptions.some(
          (online) => online.experience.id === option.experience.id
        )
    ),
  ];
}
