/**
 * Comprehensive caching service for FundFlow application
 * Supports memory cache, localStorage persistence, ETags, and cache invalidation
 */

class CacheService {
  constructor() {
    this.memoryCache = new Map();
    this.cacheConfig = {
      maxMemorySize: 50 * 1024 * 1024, // 50MB
      maxLocalStorageSize: 10 * 1024 * 1024, // 10MB
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      compressionThreshold: 1024 // Compress items larger than 1KB
    };
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0
    };
    
    // Initialize cache cleanup
    this.startCleanupTimer();
    
    // Listen for storage events from other tabs
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.handleStorageEvent.bind(this));
    }
  }

  /**
   * Generate cache key from URL and options
   */
  generateKey(url, options = {}) {
    const { method = 'GET', body, headers = {} } = options;
    const keyParts = [method, url];
    
    if (body) {
      keyParts.push(typeof body === 'string' ? body : JSON.stringify(body));
    }
    
    // Include relevant headers in key
    const relevantHeaders = ['authorization', 'content-type'];
    relevantHeaders.forEach(header => {
      if (headers[header]) {
        keyParts.push(`${header}:${headers[header]}`);
      }
    });
    
    return btoa(keyParts.join('|')).replace(/[+/=]/g, '');
  }

  /**
   * Get item from cache (memory first, then localStorage)
   */
  get(key) {
    // Check memory cache first
    const memoryItem = this.memoryCache.get(key);
    if (memoryItem && !this.isExpired(memoryItem)) {
      this.stats.hits++;
      memoryItem.lastAccessed = Date.now();
      return this.deserializeData(memoryItem.data);
    }

    // Check localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const storageKey = `fundflow_cache_${key}`;
        const storageItem = localStorage.getItem(storageKey);
        if (storageItem) {
          const parsed = JSON.parse(storageItem);
          if (!this.isExpired(parsed)) {
            this.stats.hits++;
            
            // Promote to memory cache
            this.setMemoryCache(key, parsed.data, parsed.ttl, parsed.etag);
            
            return this.deserializeData(parsed.data);
          } else {
            // Remove expired item
            localStorage.removeItem(storageKey);
          }
        }
      } catch (error) {
        console.warn('Cache localStorage read error:', error);
      }
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Set item in cache
   */
  set(key, data, options = {}) {
    const {
      ttl = this.cacheConfig.defaultTTL,
      etag = null,
      persist = true,
      compress = true
    } = options;

    const serializedData = this.serializeData(data, compress);
    
    // Set in memory cache
    this.setMemoryCache(key, serializedData, ttl, etag);

    // Set in localStorage if persist is true
    if (persist && typeof localStorage !== 'undefined') {
      const cacheItem = {
        data: serializedData,
        timestamp: Date.now(),
        ttl,
        etag,
        lastAccessed: Date.now(),
        size: this.calculateSize(serializedData)
      };
      this.setLocalStorageCache(key, cacheItem);
    }

    this.stats.sets++;
  }

  /**
   * Set item in memory cache with size management
   */
  setMemoryCache(key, data, ttl, etag) {
    const cacheItem = {
      data,
      timestamp: Date.now(),
      ttl,
      etag,
      lastAccessed: Date.now(),
      size: this.calculateSize(data)
    };

    // Check if we need to evict items
    this.evictIfNeeded(cacheItem.size);

    this.memoryCache.set(key, cacheItem);
  }

  /**
   * Set item in localStorage with size management
   */
  setLocalStorageCache(key, cacheItem) {
    try {
      const storageKey = `fundflow_cache_${key}`;
      const serialized = JSON.stringify(cacheItem);
      
      // Check localStorage size limit
      if (this.getLocalStorageSize() + serialized.length > this.cacheConfig.maxLocalStorageSize) {
        this.evictLocalStorageItems();
      }

      localStorage.setItem(storageKey, serialized);
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        this.evictLocalStorageItems();
        try {
          localStorage.setItem(storageKey, JSON.stringify(cacheItem));
        } catch (retryError) {
          console.warn('Cache localStorage write failed after eviction:', retryError);
        }
      } else {
        console.warn('Cache localStorage write error:', error);
      }
    }
  }

  /**
   * Remove item from cache
   */
  remove(key) {
    this.memoryCache.delete(key);
    
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(`fundflow_cache_${key}`);
      } catch (error) {
        console.warn('Cache localStorage remove error:', error);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear() {
    this.memoryCache.clear();
    
    if (typeof localStorage !== 'undefined') {
      try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('fundflow_cache_')) {
            localStorage.removeItem(key);
          }
        });
      } catch (error) {
        console.warn('Cache localStorage clear error:', error);
      }
    }

    this.stats = { hits: 0, misses: 0, sets: 0, evictions: 0 };
  }

  /**
   * Invalidate cache by pattern
   */
  invalidate(pattern) {
    const regex = new RegExp(pattern);
    
    // Invalidate memory cache
    for (const [key] of this.memoryCache) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }

    // Invalidate localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const keys = Object.keys(localStorage);
        keys.forEach(storageKey => {
          if (storageKey.startsWith('fundflow_cache_')) {
            const cacheKey = storageKey.replace('fundflow_cache_', '');
            if (regex.test(cacheKey)) {
              localStorage.removeItem(storageKey);
            }
          }
        });
      } catch (error) {
        console.warn('Cache localStorage invalidate error:', error);
      }
    }
  }

  /**
   * Get ETag for cached item
   */
  getETag(key) {
    const memoryItem = this.memoryCache.get(key);
    if (memoryItem && !this.isExpired(memoryItem)) {
      return memoryItem.etag;
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const storageKey = `fundflow_cache_${key}`;
        const storageItem = localStorage.getItem(storageKey);
        if (storageItem) {
          const parsed = JSON.parse(storageItem);
          if (!this.isExpired(parsed)) {
            return parsed.etag;
          }
        }
      } catch (error) {
        console.warn('Cache ETag read error:', error);
      }
    }

    return null;
  }

  /**
   * Check if cache item is expired
   */
  isExpired(item) {
    if (!item || !item.timestamp) return true;
    return Date.now() - item.timestamp > item.ttl;
  }

  /**
   * Serialize data with optional compression
   */
  serializeData(data, compress = true) {
    let serialized = JSON.stringify(data);
    
    if (compress && serialized.length > this.cacheConfig.compressionThreshold) {
      try {
        // Simple compression using LZ-string if available
        if (typeof window !== 'undefined' && window.LZString) {
          serialized = {
            compressed: true,
            data: window.LZString.compress(serialized)
          };
        }
      } catch (error) {
        console.warn('Cache compression error:', error);
      }
    }

    return serialized;
  }

  /**
   * Deserialize data with decompression
   */
  deserializeData(data) {
    if (typeof data === 'object' && data.compressed) {
      try {
        if (typeof window !== 'undefined' && window.LZString) {
          return JSON.parse(window.LZString.decompress(data.data));
        }
      } catch (error) {
        console.warn('Cache decompression error:', error);
        return null;
      }
    }

    return typeof data === 'string' ? JSON.parse(data) : data;
  }

  /**
   * Calculate size of data in bytes
   */
  calculateSize(data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return new Blob([str]).size;
  }

  /**
   * Get current memory cache size
   */
  getMemoryCacheSize() {
    let totalSize = 0;
    for (const [, item] of this.memoryCache) {
      totalSize += item.size || 0;
    }
    return totalSize;
  }

  /**
   * Get current localStorage cache size
   */
  getLocalStorageSize() {
    let totalSize = 0;
    if (typeof localStorage !== 'undefined') {
      try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('fundflow_cache_')) {
            totalSize += localStorage.getItem(key).length;
          }
        });
      } catch (error) {
        console.warn('Cache localStorage size calculation error:', error);
      }
    }
    return totalSize;
  }

  /**
   * Evict items from memory cache if needed
   */
  evictIfNeeded(newItemSize) {
    const currentSize = this.getMemoryCacheSize();
    if (currentSize + newItemSize <= this.cacheConfig.maxMemorySize) {
      return;
    }

    // Sort by last accessed time (LRU)
    const sortedEntries = Array.from(this.memoryCache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    let freedSize = 0;
    for (const [key, item] of sortedEntries) {
      this.memoryCache.delete(key);
      freedSize += item.size || 0;
      this.stats.evictions++;

      if (freedSize >= newItemSize) {
        break;
      }
    }
  }

  /**
   * Evict items from localStorage
   */
  evictLocalStorageItems() {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const items = [];
      const keys = Object.keys(localStorage);
      
      keys.forEach(storageKey => {
        if (storageKey.startsWith('fundflow_cache_')) {
          try {
            const item = JSON.parse(localStorage.getItem(storageKey));
            items.push({ key: storageKey, ...item });
          } catch (error) {
            // Remove corrupted items
            localStorage.removeItem(storageKey);
          }
        }
      });

      // Sort by last accessed time (LRU)
      items.sort((a, b) => a.lastAccessed - b.lastAccessed);

      // Remove oldest 25% of items
      const itemsToRemove = Math.ceil(items.length * 0.25);
      for (let i = 0; i < itemsToRemove; i++) {
        localStorage.removeItem(items[i].key);
        this.stats.evictions++;
      }
    } catch (error) {
      console.warn('Cache localStorage eviction error:', error);
    }
  }

  /**
   * Start cleanup timer for expired items
   */
  startCleanupTimer() {
    if (typeof setInterval !== 'undefined') {
      setInterval(() => {
        this.cleanupExpiredItems();
      }, 5 * 60 * 1000); // Run every 5 minutes
    }
  }

  /**
   * Clean up expired items
   */
  cleanupExpiredItems() {
    // Clean memory cache
    for (const [key, item] of this.memoryCache) {
      if (this.isExpired(item)) {
        this.memoryCache.delete(key);
      }
    }

    // Clean localStorage
    if (typeof localStorage !== 'undefined') {
      try {
        const keys = Object.keys(localStorage);
        keys.forEach(storageKey => {
          if (storageKey.startsWith('fundflow_cache_')) {
            try {
              const item = JSON.parse(localStorage.getItem(storageKey));
              if (this.isExpired(item)) {
                localStorage.removeItem(storageKey);
              }
            } catch (error) {
              // Remove corrupted items
              localStorage.removeItem(storageKey);
            }
          }
        });
      } catch (error) {
        console.warn('Cache cleanup error:', error);
      }
    }
  }

  /**
   * Handle storage events from other tabs
   */
  handleStorageEvent(event) {
    if (event.key && event.key.startsWith('fundflow_cache_')) {
      const cacheKey = event.key.replace('fundflow_cache_', '');
      
      if (event.newValue === null) {
        // Item was removed in another tab
        this.memoryCache.delete(cacheKey);
      } else {
        try {
          // Item was updated in another tab
          const item = JSON.parse(event.newValue);
          if (!this.isExpired(item)) {
            this.setMemoryCache(cacheKey, item.data, item.ttl, item.etag);
          }
        } catch (error) {
          console.warn('Cache storage event error:', error);
        }
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      memoryCacheSize: this.getMemoryCacheSize(),
      localStorageSize: this.getLocalStorageSize(),
      memoryCacheItems: this.memoryCache.size
    };
  }

  /**
   * Export cache for debugging
   */
  export() {
    const memoryEntries = Array.from(this.memoryCache.entries()).map(([key, value]) => ({
      key,
      ...value,
      data: typeof value.data === 'string' ? value.data.substring(0, 100) + '...' : '[Object]'
    }));

    return {
      memory: memoryEntries,
      stats: this.getStats(),
      config: this.cacheConfig
    };
  }
}

// Create singleton instance
const cacheService = new CacheService();

export default cacheService; 