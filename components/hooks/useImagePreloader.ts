import { useEffect, useRef, useCallback } from 'react';

interface PreloadOptions {
  priority?: 'critical' | 'high' | 'low' | 'idle';
}

interface PreloadTask {
  url: string;
  priority: 'critical' | 'high' | 'low' | 'idle';
  status: 'pending' | 'loading' | 'loaded' | 'error';
}

// Global cache để track images đã load
const loadedImages = new Set<string>();
const pendingTasks: PreloadTask[] = [];
let isIdleLoading = false;

// Preload single image
const preloadImage = (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (loadedImages.has(url)) {
      resolve();
      return;
    }
    
    const img = new Image();
    img.onload = () => {
      loadedImages.add(url);
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
};

// Process idle tasks using requestIdleCallback
const processIdleTasks = () => {
  if (isIdleLoading) return;
  isIdleLoading = true;

  const idleCallback = (deadline: IdleDeadline) => {
    // Process tasks while we have idle time
    while (deadline.timeRemaining() > 0 && pendingTasks.length > 0) {
      const task = pendingTasks.shift();
      if (task && task.status === 'pending') {
        task.status = 'loading';
        preloadImage(task.url)
          .then(() => { task.status = 'loaded'; })
          .catch(() => { task.status = 'error'; });
      }
    }

    // Continue if more tasks
    if (pendingTasks.length > 0) {
      requestIdleCallback(idleCallback, { timeout: 2000 });
    } else {
      isIdleLoading = false;
    }
  };

  // Fallback for browsers without requestIdleCallback
  if ('requestIdleCallback' in window) {
    requestIdleCallback(idleCallback, { timeout: 2000 });
  } else {
    // Fallback: use setTimeout
    const fallbackProcess = () => {
      const task = pendingTasks.shift();
      if (task && task.status === 'pending') {
        task.status = 'loading';
        preloadImage(task.url)
          .then(() => { task.status = 'loaded'; })
          .catch(() => { task.status = 'error'; });
      }
      if (pendingTasks.length > 0) {
        setTimeout(fallbackProcess, 50);
      } else {
        isIdleLoading = false;
      }
    };
    setTimeout(fallbackProcess, 50);
  }
};

export const useImagePreloader = () => {
  const abortRef = useRef(false);

  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  // Preload images với priority
  const preload = useCallback(async (urls: string[], options: PreloadOptions = {}) => {
    const { priority = 'high' } = options;
    const validUrls = urls.filter(url => url && !loadedImages.has(url));

    if (validUrls.length === 0) return;

    switch (priority) {
      case 'critical':
        // Load ngay lập tức, parallel
        await Promise.all(validUrls.map(url => preloadImage(url)));
        break;

      case 'high':
        // Load ngay nhưng sequential để không block
        for (const url of validUrls) {
          if (abortRef.current) break;
          await preloadImage(url).catch(() => {});
        }
        break;

      case 'low':
        // Add to queue với delay nhỏ
        validUrls.forEach(url => {
          pendingTasks.push({ url, priority: 'low', status: 'pending' });
        });
        setTimeout(processIdleTasks, 100);
        break;

      case 'idle':
        // Add to queue, process khi browser rảnh
        validUrls.forEach(url => {
          pendingTasks.push({ url, priority: 'idle', status: 'pending' });
        });
        processIdleTasks();
        break;
    }
  }, []);

  // Preload trang đầu của nhiều documents (cho Sidebar)
  const preloadFirstPages = useCallback((documents: { pageImageUrls?: (string | null)[] }[]) => {
    const firstPageUrls = documents
      .map(doc => doc.pageImageUrls?.[0])
      .filter((url): url is string => !!url);
    
    if (firstPageUrls.length > 0) {
      // Critical: load trang đầu của tất cả documents
      preload(firstPageUrls, { priority: 'critical' });
    }
  }, [preload]);

  // Preload cho flipbook viewer với chiến lược 4-tier
  // initialPages: Desktop = 2 (double view), Mobile = 1 (single view)
  const preloadForViewer = useCallback((
    pageImageUrls: (string | null)[],
    currentPage: number,
    initialPages: number = 2
  ) => {
    const validUrls = pageImageUrls.filter((url): url is string => !!url);
    if (validUrls.length === 0) return;

    const currentIndex = currentPage - 1;

    // TIER 1: Critical - load số trang hiển thị (2 cho desktop, 1 cho mobile)
    const criticalStart = Math.max(0, currentIndex);
    const criticalEnd = Math.min(validUrls.length, criticalStart + initialPages);
    const criticalUrls = validUrls.slice(criticalStart, criticalEnd);
    preload(criticalUrls, { priority: 'critical' });

    // TIER 2: High - 2 trang tiếp theo (để sẵn sàng khi lật)
    const highStart = criticalEnd;
    const highEnd = Math.min(validUrls.length, highStart + 2);
    const highUrls = validUrls.slice(highStart, highEnd);
    if (highUrls.length > 0) {
      preload(highUrls, { priority: 'high' });
    }

    // TIER 3: Low - 4 trang tiếp
    const lowStart = highEnd;
    const lowEnd = Math.min(validUrls.length, lowStart + 4);
    const lowUrls = validUrls.slice(lowStart, lowEnd);
    if (lowUrls.length > 0) {
      preload(lowUrls, { priority: 'low' });
    }

    // TIER 4: Idle - còn lại, load khi browser rảnh
    const idleUrls = validUrls.slice(lowEnd);
    if (idleUrls.length > 0) {
      preload(idleUrls, { priority: 'idle' });
    }
  }, [preload]);

  // Check if image is already loaded
  const isLoaded = useCallback((url: string) => loadedImages.has(url), []);

  // Get cache stats
  const getCacheStats = useCallback(() => ({
    loaded: loadedImages.size,
    pending: pendingTasks.length,
    isIdleLoading
  }), []);

  return {
    preload,
    preloadFirstPages,
    preloadForViewer,
    isLoaded,
    getCacheStats
  };
};

// Export singleton functions để dùng ngoài React
export const ImagePreloader = {
  preloadImage,
  isLoaded: (url: string) => loadedImages.has(url),
  getCacheSize: () => loadedImages.size
};
