import cacheService from './cacheService';

/**
 * Enhanced API service with caching, ETags, compression, and request batching
 */
class ApiService {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || '/api';
    this.requestQueue = new Map();
    this.batchQueue = [];
    this.batchTimeout = null;
    this.batchDelay = 50; // ms
    this.maxBatchSize = 10;
    
    // Request interceptors
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    
    // Default headers
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate, br'
    };

    // Performance monitoring
    this.performanceMetrics = {
      totalRequests: 0,
      cacheHits: 0,
      networkRequests: 0,
      averageResponseTime: 0,
      totalResponseTime: 0
    };
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor) {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Get CSRF token from DOM
   */
  getCSRFToken() {
    return document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
  }

  /**
   * Build full URL
   */
  buildURL(endpoint) {
    if (endpoint.startsWith('http')) {
      return endpoint;
    }
    return `${this.baseURL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  }

  /**
   * Apply request interceptors
   */
  async applyRequestInterceptors(config) {
    let modifiedConfig = { ...config };
    
    for (const interceptor of this.requestInterceptors) {
      try {
        modifiedConfig = await interceptor(modifiedConfig);
      } catch (error) {
        console.warn('Request interceptor error:', error);
      }
    }
    
    return modifiedConfig;
  }

  /**
   * Apply response interceptors
   */
  async applyResponseInterceptors(response, config) {
    let modifiedResponse = response;
    
    for (const interceptor of this.responseInterceptors) {
      try {
        modifiedResponse = await interceptor(modifiedResponse, config);
      } catch (error) {
        console.warn('Response interceptor error:', error);
      }
    }
    
    return modifiedResponse;
  }

  /**
   * Enhanced fetch with caching, ETags, and performance monitoring
   */
  async request(endpoint, options = {}) {
    const startTime = performance.now();
    this.performanceMetrics.totalRequests++;

    try {
      // Build configuration
      let config = {
        method: 'GET',
        headers: { ...this.defaultHeaders },
        cache: 'no-cache',
        ...options
      };

      // Apply request interceptors
      config = await this.applyRequestInterceptors(config);

      // Add CSRF token for non-GET requests
      if (config.method !== 'GET') {
        config.headers['X-CSRFToken'] = this.getCSRFToken();
      }

      const url = this.buildURL(endpoint);
      const cacheKey = cacheService.generateKey(url, config);

      // Check cache for GET requests
      if (config.method === 'GET' && config.useCache !== false) {
        const cachedData = cacheService.get(cacheKey);
        if (cachedData) {
          this.performanceMetrics.cacheHits++;
          this.updatePerformanceMetrics(startTime);
          return cachedData;
        }

        // Add ETag header if available
        const etag = cacheService.getETag(cacheKey);
        if (etag) {
          config.headers['If-None-Match'] = etag;
        }
      }

      // Check for duplicate requests
      if (this.requestQueue.has(cacheKey)) {
        return this.requestQueue.get(cacheKey);
      }

      // Make the request
      const requestPromise = this.makeRequest(url, config, cacheKey, startTime);
      
      // Store in request queue to prevent duplicates
      this.requestQueue.set(cacheKey, requestPromise);

      // Clean up request queue when done
      requestPromise.finally(() => {
        this.requestQueue.delete(cacheKey);
      });

      return await requestPromise;

    } catch (error) {
      this.updatePerformanceMetrics(startTime);
      throw this.enhanceError(error, endpoint, options);
    }
  }

  /**
   * Make the actual HTTP request
   */
  async makeRequest(url, config, cacheKey, startTime) {
    this.performanceMetrics.networkRequests++;

    const response = await fetch(url, config);

    // Handle 304 Not Modified
    if (response.status === 304) {
      const cachedData = cacheService.get(cacheKey);
      if (cachedData) {
        this.performanceMetrics.cacheHits++;
        this.updatePerformanceMetrics(startTime);
        return cachedData;
      }
    }

    // Check if response is ok
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Parse response
    let data;
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else if (contentType && contentType.includes('text/')) {
      data = await response.text();
    } else {
      data = await response.blob();
    }

    // Apply response interceptors
    const processedResponse = await this.applyResponseInterceptors({
      data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config
    }, config);

    // Cache GET responses
    if (config.method === 'GET' && config.useCache !== false) {
      const etag = response.headers.get('etag');
      const cacheControl = response.headers.get('cache-control');
      
      let ttl = cacheService.cacheConfig.defaultTTL;
      
      // Parse cache-control header
      if (cacheControl) {
        const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
        if (maxAgeMatch) {
          ttl = parseInt(maxAgeMatch[1]) * 1000; // Convert to milliseconds
        }
      }

      cacheService.set(cacheKey, processedResponse.data, {
        ttl,
        etag,
        persist: config.persist !== false
      });
    }

    // Invalidate related cache entries for non-GET requests
    if (config.method !== 'GET') {
      this.invalidateRelatedCache(url, config);
    }

    this.updatePerformanceMetrics(startTime);
    return processedResponse.data;
  }

  /**
   * Invalidate related cache entries
   */
  invalidateRelatedCache(url, config) {
    // Extract resource type from URL
    const urlParts = url.split('/');
    const resourceType = urlParts[urlParts.length - 2] || urlParts[urlParts.length - 1];
    
    // Invalidate cache patterns based on resource type
    const patterns = [
      `.*${resourceType}.*`,
      '.*transactions.*', // Always invalidate transaction-related cache
      '.*categories.*',   // Always invalidate category-related cache
      '.*vendors.*'       // Always invalidate vendor-related cache
    ];

    patterns.forEach(pattern => {
      try {
        cacheService.invalidate(pattern);
      } catch (error) {
        console.warn('Cache invalidation error:', error);
      }
    });
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(startTime) {
    const responseTime = performance.now() - startTime;
    this.performanceMetrics.totalResponseTime += responseTime;
    this.performanceMetrics.averageResponseTime = 
      this.performanceMetrics.totalResponseTime / this.performanceMetrics.totalRequests;
  }

  /**
   * Enhance error with additional context
   */
  enhanceError(error, endpoint, options) {
    const enhancedError = new Error(error.message);
    enhancedError.name = error.name;
    enhancedError.endpoint = endpoint;
    enhancedError.options = options;
    enhancedError.timestamp = new Date().toISOString();
    enhancedError.originalError = error;
    
    return enhancedError;
  }

  /**
   * Batch multiple requests
   */
  async batch(requests) {
    const results = [];

    // Group requests by method
    const getRequests = requests.filter(req => (req.options?.method || 'GET') === 'GET');
    const otherRequests = requests.filter(req => (req.options?.method || 'GET') !== 'GET');

    // Process GET requests in parallel (they can be cached)
    if (getRequests.length > 0) {
      const getPromises = getRequests.map(req => 
        this.request(req.endpoint, req.options).catch(error => ({ error }))
      );
      const getResults = await Promise.all(getPromises);
      results.push(...getResults);
    }

    // Process other requests sequentially to maintain order
    for (const req of otherRequests) {
      try {
        const result = await this.request(req.endpoint, req.options);
        results.push(result);
      } catch (error) {
        results.push({ error });
      }
    }

    return results;
  }

  /**
   * Convenience methods for different HTTP verbs
   */
  async get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }

  async post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async patch(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Upload file with progress tracking
   */
  async upload(endpoint, file, options = {}) {
    const formData = new FormData();
    formData.append('file', file);

    // Add additional fields
    if (options.fields) {
      Object.entries(options.fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    const config = {
      ...options,
      method: 'POST',
      body: formData,
      headers: {
        'X-CSRFToken': this.getCSRFToken(),
        // Don't set Content-Type, let browser set it with boundary
      }
    };

    // Remove Content-Type from default headers for file upload
    delete config.headers['Content-Type'];

    return this.request(endpoint, config);
  }

  /**
   * Download file
   */
  async download(endpoint, options = {}) {
    const response = await this.request(endpoint, {
      ...options,
      useCache: false // Don't cache downloads
    });

    // Create download link
    const blob = new Blob([response]);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = options.filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    return response;
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const cacheStats = cacheService.getStats();
    
    return {
      ...this.performanceMetrics,
      cacheHitRate: cacheStats.hitRate,
      cacheSize: cacheStats.memoryCacheSize + cacheStats.localStorageSize,
      cacheItems: cacheStats.memoryCacheItems
    };
  }

  /**
   * Clear all caches
   */
  clearCache() {
    cacheService.clear();
    this.requestQueue.clear();
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await this.get('/health/', { useCache: false });
      return { status: 'healthy', ...response };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
}

// Create singleton instance
const apiService = new ApiService();

// Add default request interceptor for authentication
apiService.addRequestInterceptor(async (config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Add default response interceptor for error handling
apiService.addResponseInterceptor(async (response, config) => {
  // Handle authentication errors
  if (response.status === 401) {
    localStorage.removeItem('authToken');
    window.location.href = '/login';
  }
  
  return response;
});

export default apiService; 