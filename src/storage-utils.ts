/**
 * Utilities for inspecting, persisting, and deleting browser CacheStorage
 * used by Kokoro TTS / Transformers.js.
 */

export interface StorageInfo {
  isCached: boolean;
  modelSizeBytes: number;
  modelSizeFormatted: string;
  totalUsageBytes: number;
  totalUsageFormatted: string;
  persisted: boolean;
}

const CACHE_NAME = "transformers-cache";

/**
 * Format raw bytes into human-readable strings (e.g. 86.4 MB).
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Request persistent browser storage to prevent automatic OS cache eviction.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.storage?.persist) {
    return await navigator.storage.persist();
  }
  return false;
}

/**
 * Check whether persistent storage has already been granted.
 */
export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.storage?.persisted) {
    return await navigator.storage.persisted();
  }
  return false;
}

/**
 * Inspect CacheStorage to determine if Kokoro-82M is stored offline,
 * calculate its size on disk, and get total origin storage usage.
 */
export async function getModelStorageInfo(): Promise<StorageInfo> {
  let modelSizeBytes = 0;
  let isCached = false;
  let totalUsageBytes = 0;
  let persisted = false;

  // 1. Inspect CacheStorage
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const hasCache = await caches.has(CACHE_NAME);
      if (hasCache) {
        const cache = await caches.open(CACHE_NAME);
        const requests = await cache.keys();

        for (const req of requests) {
          if (
            req.url.includes("Kokoro-82M") ||
            req.url.includes("kokoro") ||
            req.url.includes(".onnx") ||
            req.url.includes("voices")
          ) {
            isCached = true;
            const res = await cache.match(req);
            if (res) {
              const blob = await res.clone().blob();
              modelSizeBytes += blob.size;
            }
          }
        }
      }
    } catch (err) {
      console.warn("Unable to inspect CacheStorage:", err);
    }
  }

  // 2. Inspect Storage Estimate & Persistence
  if (typeof navigator !== "undefined" && navigator.storage) {
    try {
      if (navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        totalUsageBytes = estimate.usage || 0;
      }
      if (navigator.storage.persisted) {
        persisted = await navigator.storage.persisted();
      }
    } catch (err) {
      console.warn("Unable to get storage estimate:", err);
    }
  }

  return {
    isCached,
    modelSizeBytes,
    modelSizeFormatted: formatBytes(modelSizeBytes),
    totalUsageBytes,
    totalUsageFormatted: formatBytes(totalUsageBytes),
    persisted,
  };
}

/**
 * Delete the cached model from CacheStorage to reclaim disk space.
 * @param onlyKokoro If true, only deletes Kokoro/ONNX related keys; if false, deletes entire 'transformers-cache' bucket.
 */
export async function deleteModelCache(onlyKokoro = false): Promise<boolean> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return false;
  }

  try {
    const hasCache = await caches.has(CACHE_NAME);
    if (!hasCache) return true;

    if (onlyKokoro) {
      const cache = await caches.open(CACHE_NAME);
      const requests = await cache.keys();
      for (const req of requests) {
        if (
          req.url.includes("Kokoro-82M") ||
          req.url.includes("kokoro") ||
          req.url.includes(".onnx") ||
          req.url.includes("voices")
        ) {
          await cache.delete(req);
        }
      }
      return true;
    } else {
      return await caches.delete(CACHE_NAME);
    }
  } catch (err) {
    console.error("Failed to delete model cache:", err);
    return false;
  }
}
