import React, { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Custom hook for monitoring component performance
 * Tracks render counts, render times, and provides performance insights
 */
export const usePerformanceMonitor = (componentName = 'Component') => {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(0);
  const renderTimes = useRef([]);
  const [performanceData, setPerformanceData] = useState({
    renderCount: 0,
    averageRenderTime: 0,
    lastRenderTime: 0,
    slowRenders: 0
  });

  // Track render count and timing
  useEffect(() => {
    renderCount.current += 1;
    const renderTime = performance.now() - lastRenderTime.current;
    
    if (lastRenderTime.current > 0) {
      renderTimes.current.push(renderTime);
      
      // Keep only last 100 render times for memory efficiency
      if (renderTimes.current.length > 100) {
        renderTimes.current = renderTimes.current.slice(-100);
      }
    }
    
    lastRenderTime.current = performance.now();
    
    // Update performance data
    const times = renderTimes.current;
    const averageTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
    const slowRenders = times.filter(time => time > 16).length; // > 16ms is considered slow
    
    setPerformanceData({
      renderCount: renderCount.current,
      averageRenderTime: averageTime,
      lastRenderTime: renderTime,
      slowRenders
    });
    
    // Log performance warnings in development
    if (process.env.NODE_ENV === 'development') {
      if (renderTime > 16) {
        console.warn(`Slow render detected in ${componentName}: ${renderTime.toFixed(2)}ms`);
      }
      
      if (renderCount.current % 50 === 0) {
        console.log(`Performance stats for ${componentName}:`, {
          renders: renderCount.current,
          avgTime: averageTime.toFixed(2) + 'ms',
          slowRenders: slowRenders
        });
      }
    }
  }, [componentName]);

  // Method to reset performance tracking
  const resetPerformanceData = useCallback(() => {
    renderCount.current = 0;
    renderTimes.current = [];
    setPerformanceData({
      renderCount: 0,
      averageRenderTime: 0,
      lastRenderTime: 0,
      slowRenders: 0
    });
  }, []);

  return {
    performanceData,
    resetPerformanceData
  };
};

/**
 * Custom hook for monitoring expensive operations
 * Tracks operation timing and provides performance insights
 */
export const useOperationTimer = () => {
  const [operations, setOperations] = useState(new Map());

  const startOperation = useCallback((operationName) => {
    const startTime = performance.now();
    setOperations(prev => new Map(prev.set(operationName, { startTime, endTime: null })));
    return operationName;
  }, []);

  const endOperation = useCallback((operationName) => {
    const endTime = performance.now();
    setOperations(prev => {
      const newMap = new Map(prev);
      const operation = newMap.get(operationName);
      if (operation) {
        operation.endTime = endTime;
        operation.duration = endTime - operation.startTime;
        
        // Log slow operations in development
        if (process.env.NODE_ENV === 'development' && operation.duration > 100) {
          console.warn(`Slow operation detected: ${operationName} took ${operation.duration.toFixed(2)}ms`);
        }
      }
      return newMap;
    });
  }, []);

  const getOperationStats = useCallback(() => {
    const stats = Array.from(operations.entries()).map(([name, data]) => ({
      name,
      duration: data.duration || (data.endTime ? data.endTime - data.startTime : null),
      isComplete: data.endTime !== null
    }));
    
    return stats;
  }, [operations]);

  return {
    startOperation,
    endOperation,
    getOperationStats,
    operations: Array.from(operations.entries())
  };
};

/**
 * Custom hook for tracking Web Vitals performance metrics
 */
export const useWebVitals = () => {
  const [vitals, setVitals] = useState({
    CLS: null,
    FID: null,
    FCP: null,
    LCP: null,
    TTFB: null
  });

  useEffect(() => {
    // Dynamically import web-vitals to avoid bundle size impact
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB }) => {
      getCLS((metric) => setVitals(prev => ({ ...prev, CLS: metric })));
      getFID((metric) => setVitals(prev => ({ ...prev, FID: metric })));
      getFCP((metric) => setVitals(prev => ({ ...prev, FCP: metric })));
      getLCP((metric) => setVitals(prev => ({ ...prev, LCP: metric })));
      getTTFB((metric) => setVitals(prev => ({ ...prev, TTFB: metric })));
    }).catch(error => {
      console.warn('Failed to load web-vitals:', error);
    });
  }, []);

  return vitals;
};

/**
 * Custom hook for memory usage monitoring
 */
export const useMemoryMonitor = () => {
  const [memoryInfo, setMemoryInfo] = useState(null);

  useEffect(() => {
    const updateMemoryInfo = () => {
      if ('memory' in performance) {
        setMemoryInfo({
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
          usagePercentage: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100
        });
      }
    };

    // Update immediately
    updateMemoryInfo();

    // Update every 5 seconds
    const interval = setInterval(updateMemoryInfo, 5000);

    return () => clearInterval(interval);
  }, []);

  return memoryInfo;
};

/**
 * Performance profiler component wrapper
 */
export const withPerformanceProfiler = (WrappedComponent, componentName) => {
  return function ProfiledComponent(props) {
    const onRenderCallback = useCallback((id, phase, actualDuration, baseDuration, startTime, commitTime) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('Profiler data:', {
          component: componentName || id,
          phase,
          actualDuration: actualDuration.toFixed(2) + 'ms',
          baseDuration: baseDuration.toFixed(2) + 'ms',
          startTime: startTime.toFixed(2) + 'ms',
          commitTime: commitTime.toFixed(2) + 'ms'
        });
      }
    }, []);

    return (
      <React.Profiler id={componentName || 'ProfiledComponent'} onRender={onRenderCallback}>
        <WrappedComponent {...props} />
      </React.Profiler>
    );
  };
};

export default usePerformanceMonitor; 