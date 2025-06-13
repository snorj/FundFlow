import { useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook for throttled scroll event handling
 * Improves performance by limiting how often scroll handlers execute
 * 
 * @param {Function} callback - The scroll handler function
 * @param {number} delay - Throttle delay in milliseconds (default: 16ms for 60fps)
 * @param {Array} deps - Dependencies array for the callback
 * @returns {Object} - Scroll utilities and state
 */
export const useThrottledScroll = (callback, delay = 16, deps = []) => {
  const lastRun = useRef(Date.now());
  const timeoutRef = useRef(null);
  const isScrolling = useRef(false);
  const scrollEndTimeoutRef = useRef(null);

  const throttledCallback = useCallback((...args) => {
    const now = Date.now();
    
    if (now - lastRun.current >= delay) {
      callback(...args);
      lastRun.current = now;
    } else {
      // Schedule the callback to run after the remaining delay
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        callback(...args);
        lastRun.current = Date.now();
      }, delay - (now - lastRun.current));
    }
  }, [callback, delay, ...deps]);

  const handleScroll = useCallback((event) => {
    isScrolling.current = true;
    
    // Clear existing scroll end timeout
    if (scrollEndTimeoutRef.current) {
      clearTimeout(scrollEndTimeoutRef.current);
    }
    
    // Execute throttled callback
    throttledCallback(event);
    
    // Set timeout to detect scroll end
    scrollEndTimeoutRef.current = setTimeout(() => {
      isScrolling.current = false;
    }, 150); // 150ms after last scroll event
  }, [throttledCallback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (scrollEndTimeoutRef.current) {
        clearTimeout(scrollEndTimeoutRef.current);
      }
    };
  }, []);

  return {
    handleScroll,
    isScrolling: () => isScrolling.current
  };
};

/**
 * Custom hook for throttled window scroll events
 * Automatically attaches and detaches scroll listeners
 * 
 * @param {Function} callback - The scroll handler function
 * @param {number} delay - Throttle delay in milliseconds
 * @param {Array} deps - Dependencies array for the callback
 */
export const useThrottledWindowScroll = (callback, delay = 16, deps = []) => {
  const { handleScroll } = useThrottledScroll(callback, delay, deps);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);
};

/**
 * Custom hook for throttled element scroll events
 * 
 * @param {React.RefObject} elementRef - Ref to the scrollable element
 * @param {Function} callback - The scroll handler function
 * @param {number} delay - Throttle delay in milliseconds
 * @param {Array} deps - Dependencies array for the callback
 */
export const useThrottledElementScroll = (elementRef, callback, delay = 16, deps = []) => {
  const { handleScroll } = useThrottledScroll(callback, delay, deps);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    element.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      element.removeEventListener('scroll', handleScroll);
    };
  }, [elementRef, handleScroll]);
};

/**
 * Custom hook for infinite scroll implementation
 * Detects when user scrolls near the bottom of an element
 * 
 * @param {React.RefObject} elementRef - Ref to the scrollable element
 * @param {Function} onLoadMore - Function to call when more content should be loaded
 * @param {number} threshold - Distance from bottom to trigger load (default: 100px)
 * @param {boolean} hasMore - Whether there's more content to load
 * @param {boolean} isLoading - Whether content is currently loading
 */
export const useInfiniteScroll = (
  elementRef, 
  onLoadMore, 
  threshold = 100, 
  hasMore = true, 
  isLoading = false
) => {
  const handleScroll = useCallback(() => {
    const element = elementRef.current;
    if (!element || !hasMore || isLoading) return;

    const { scrollTop, scrollHeight, clientHeight } = element;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceFromBottom < threshold) {
      onLoadMore();
    }
  }, [elementRef, onLoadMore, threshold, hasMore, isLoading]);

  useThrottledElementScroll(elementRef, handleScroll, 100, [handleScroll]);
};

export default useThrottledScroll; 