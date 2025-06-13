import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for lazy loading with Intersection Observer
 * Loads content when element becomes visible in viewport
 * 
 * @param {Object} options - Configuration options
 * @param {number} options.threshold - Intersection threshold (0-1)
 * @param {string} options.rootMargin - Root margin for early loading
 * @param {boolean} options.triggerOnce - Whether to trigger only once
 * @param {Function} options.onIntersect - Callback when element intersects
 * @returns {Object} - Ref and loading state
 */
export const useLazyLoading = ({
  threshold = 0.1,
  rootMargin = '50px',
  triggerOnce = true,
  onIntersect = null
} = {}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);
  const elementRef = useRef(null);
  const observerRef = useRef(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Create intersection observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        const isIntersecting = entry.isIntersecting;

        if (isIntersecting && (!triggerOnce || !hasTriggered)) {
          setIsVisible(true);
          setHasTriggered(true);
          
          if (onIntersect) {
            onIntersect(entry);
          }

          // Disconnect if triggerOnce is true
          if (triggerOnce) {
            observerRef.current?.disconnect();
          }
        } else if (!triggerOnce) {
          setIsVisible(isIntersecting);
        }
      },
      {
        threshold,
        rootMargin
      }
    );

    observerRef.current.observe(element);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [threshold, rootMargin, triggerOnce, onIntersect, hasTriggered]);

  return {
    ref: elementRef,
    isVisible,
    hasTriggered
  };
};

/**
 * Custom hook for progressive data loading
 * Loads data in chunks as needed
 * 
 * @param {Function} loadData - Function to load data chunks
 * @param {Object} options - Configuration options
 * @param {number} options.pageSize - Number of items per page
 * @param {number} options.prefetchPages - Number of pages to prefetch
 * @param {boolean} options.enabled - Whether progressive loading is enabled
 * @returns {Object} - Data, loading state, and load functions
 */
export const useProgressiveLoading = (
  loadData,
  {
    pageSize = 20,
    prefetchPages = 1,
    enabled = true
  } = {}
) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [error, setError] = useState(null);
  const loadingRef = useRef(false);
  const abortControllerRef = useRef(null);

  const loadPage = useCallback(async (page, append = true) => {
    if (!enabled || loadingRef.current) return;

    try {
      loadingRef.current = true;
      setLoading(true);
      setError(null);

      // Cancel previous request if exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      const result = await loadData({
        page,
        pageSize,
        signal: abortControllerRef.current.signal
      });

      if (result.data) {
        setData(prevData => append ? [...prevData, ...result.data] : result.data);
        setHasMore(result.hasMore !== false && result.data.length === pageSize);
        
        if (append) {
          setCurrentPage(page);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err);
        console.error('Progressive loading error:', err);
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [loadData, pageSize, enabled]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      loadPage(currentPage + 1, true);
    }
  }, [currentPage, hasMore, loading, loadPage]);

  const reload = useCallback(() => {
    setData([]);
    setCurrentPage(0);
    setHasMore(true);
    setError(null);
    loadPage(0, false);
  }, [loadPage]);

  const prefetchNext = useCallback(() => {
    if (hasMore && !loading && prefetchPages > 0) {
      // Prefetch next pages in background
      for (let i = 1; i <= prefetchPages; i++) {
        const nextPage = currentPage + i;
        setTimeout(() => {
          loadPage(nextPage, true);
        }, i * 100); // Stagger prefetch requests
      }
    }
  }, [currentPage, hasMore, loading, prefetchPages, loadPage]);

  // Initial load
  useEffect(() => {
    if (enabled && data.length === 0 && !loading) {
      loadPage(0, false);
    }
  }, [enabled, data.length, loading, loadPage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    loading,
    hasMore,
    error,
    loadMore,
    reload,
    prefetchNext,
    currentPage
  };
};

/**
 * Custom hook for infinite scroll implementation
 * Combines lazy loading with progressive data loading
 * 
 * @param {Function} loadData - Function to load data
 * @param {Object} options - Configuration options
 * @returns {Object} - Combined lazy loading and progressive loading state
 */
export const useInfiniteScroll = (loadData, options = {}) => {
  const {
    threshold = 0.1,
    rootMargin = '100px',
    pageSize = 20,
    prefetchPages = 1,
    enabled = true
  } = options;

  const progressiveLoading = useProgressiveLoading(loadData, {
    pageSize,
    prefetchPages,
    enabled
  });

  const lazyLoading = useLazyLoading({
    threshold,
    rootMargin,
    triggerOnce: false,
    onIntersect: () => {
      if (progressiveLoading.hasMore && !progressiveLoading.loading) {
        progressiveLoading.loadMore();
      }
    }
  });

  return {
    ...progressiveLoading,
    sentinelRef: lazyLoading.ref,
    isVisible: lazyLoading.isVisible
  };
};

/**
 * Custom hook for lazy loading tree nodes
 * Loads child nodes only when parent is expanded
 * 
 * @param {Function} loadChildren - Function to load child nodes
 * @param {string} nodeId - ID of the parent node
 * @param {boolean} isExpanded - Whether the node is expanded
 * @returns {Object} - Children data and loading state
 */
export const useLazyTreeNode = (loadChildren, nodeId, isExpanded) => {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const loadNodeChildren = useCallback(async () => {
    if (!isExpanded || loaded || loading) return;

    try {
      setLoading(true);
      setError(null);

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      const result = await loadChildren({
        nodeId,
        signal: abortControllerRef.current.signal
      });

      setChildren(result.children || []);
      setLoaded(true);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err);
        console.error('Lazy tree node loading error:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [loadChildren, nodeId, isExpanded, loaded, loading]);

  useEffect(() => {
    if (isExpanded && !loaded) {
      loadNodeChildren();
    }
  }, [isExpanded, loaded, loadNodeChildren]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    children,
    loading,
    loaded,
    error,
    reload: () => {
      setLoaded(false);
      setChildren([]);
      loadNodeChildren();
    }
  };
};

/**
 * Custom hook for data prefetching
 * Prefetches data for improved perceived performance
 * 
 * @param {Function} prefetchData - Function to prefetch data
 * @param {Array} prefetchKeys - Keys to prefetch
 * @param {Object} options - Configuration options
 * @returns {Object} - Prefetch utilities
 */
export const useDataPrefetch = (
  prefetchData,
  prefetchKeys = [],
  {
    delay = 100,
    enabled = true
  } = {}
) => {
  const [prefetchedData, setPrefetchedData] = useState(new Map());
  const [prefetching, setPrefetching] = useState(new Set());
  const abortControllersRef = useRef(new Map());

  const prefetch = useCallback(async (key) => {
    if (!enabled || prefetchedData.has(key) || prefetching.has(key)) {
      return;
    }

    try {
      setPrefetching(prev => new Set(prev).add(key));

      // Cancel existing request for this key
      const existingController = abortControllersRef.current.get(key);
      if (existingController) {
        existingController.abort();
      }

      // Create new abort controller
      const abortController = new AbortController();
      abortControllersRef.current.set(key, abortController);

      const data = await prefetchData({
        key,
        signal: abortController.signal
      });

      setPrefetchedData(prev => new Map(prev).set(key, data));
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Prefetch error for key:', key, err);
      }
    } finally {
      setPrefetching(prev => {
        const newSet = new Set(prev);
        newSet.delete(key);
        return newSet;
      });
      abortControllersRef.current.delete(key);
    }
  }, [prefetchData, enabled, prefetchedData, prefetching]);

  const prefetchWithDelay = useCallback((key) => {
    setTimeout(() => prefetch(key), delay);
  }, [prefetch, delay]);

  // Prefetch initial keys
  useEffect(() => {
    if (enabled && prefetchKeys.length > 0) {
      prefetchKeys.forEach((key, index) => {
        setTimeout(() => prefetch(key), index * delay);
      });
    }
  }, [prefetchKeys, enabled, delay, prefetch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach(controller => {
        controller.abort();
      });
      abortControllersRef.current.clear();
    };
  }, []);

  return {
    prefetchedData,
    prefetching,
    prefetch,
    prefetchWithDelay,
    getPrefetchedData: (key) => prefetchedData.get(key),
    isPrefetching: (key) => prefetching.has(key),
    clearPrefetchedData: () => setPrefetchedData(new Map())
  };
};

export default useLazyLoading; 