from django.core.cache import cache
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.views.decorators.vary import vary_on_headers
from rest_framework.response import Response
from rest_framework import status
import hashlib
import json
import time
import logging

logger = logging.getLogger(__name__)

class CacheOptimizedMixin:
    """
    Mixin to add intelligent caching to API views
    """
    cache_timeout = 300  # 5 minutes default
    cache_key_prefix = 'api'
    cache_vary_headers = ['Authorization', 'Accept-Language']
    
    def get_cache_key(self, request, *args, **kwargs):
        """
        Generate a unique cache key for the request
        """
        # Include view name, method, and relevant parameters
        key_parts = [
            self.cache_key_prefix,
            self.__class__.__name__,
            request.method,
            request.path,
        ]
        
        # Include query parameters for GET requests
        if request.method == 'GET' and request.GET:
            query_string = '&'.join(f"{k}={v}" for k, v in sorted(request.GET.items()))
            key_parts.append(hashlib.md5(query_string.encode()).hexdigest())
        
        # Include user ID for authenticated requests
        if hasattr(request, 'user') and request.user.is_authenticated:
            key_parts.append(f"user_{request.user.id}")
        
        return ':'.join(key_parts)
    
    def get_cached_response(self, request, *args, **kwargs):
        """
        Try to get response from cache
        """
        if request.method != 'GET':
            return None
            
        cache_key = self.get_cache_key(request, *args, **kwargs)
        cached_data = cache.get(cache_key)
        
        if cached_data:
            logger.debug(f"Cache hit for key: {cache_key}")
            return Response(cached_data, status=status.HTTP_200_OK)
        
        return None
    
    def cache_response(self, request, response, *args, **kwargs):
        """
        Cache the response if appropriate
        """
        if (request.method == 'GET' and 
            response.status_code == 200 and 
            hasattr(response, 'data')):
            
            cache_key = self.get_cache_key(request, *args, **kwargs)
            cache.set(cache_key, response.data, self.cache_timeout)
            logger.debug(f"Cached response for key: {cache_key}")
    
    def invalidate_cache_pattern(self, pattern):
        """
        Invalidate cache keys matching a pattern
        """
        # This is a simplified version - in production, consider using Redis SCAN
        # or maintaining a separate index of cache keys
        try:
            if hasattr(cache, 'delete_pattern'):
                cache.delete_pattern(f"{self.cache_key_prefix}:*{pattern}*")
            else:
                logger.warning("Cache backend doesn't support pattern deletion")
        except Exception as e:
            logger.error(f"Cache invalidation failed: {e}")


class PerformanceMonitoringMixin:
    """
    Mixin to add performance monitoring to API views
    """
    
    def dispatch(self, request, *args, **kwargs):
        """
        Add performance monitoring to request dispatch
        """
        start_time = time.time()
        
        # Add timing to request
        request._view_start_time = start_time
        
        # Call parent dispatch
        response = super().dispatch(request, *args, **kwargs)
        
        # Calculate and log performance metrics
        duration = time.time() - start_time
        
        # Add performance headers
        response['X-View-Time'] = f"{duration:.3f}s"
        
        # Log slow views
        if duration > 0.5:  # Log views taking more than 500ms
            logger.warning(
                f"Slow view: {self.__class__.__name__} "
                f"took {duration:.3f}s for {request.method} {request.path}"
            )
        
        return response


class QueryOptimizationMixin:
    """
    Mixin to optimize database queries
    """
    
    def get_queryset(self):
        """
        Optimize queryset with select_related and prefetch_related
        """
        queryset = super().get_queryset()
        
        # Add common optimizations
        if hasattr(self, 'select_related_fields'):
            queryset = queryset.select_related(*self.select_related_fields)
        
        if hasattr(self, 'prefetch_related_fields'):
            queryset = queryset.prefetch_related(*self.prefetch_related_fields)
        
        return queryset
    
    def get_serializer_context(self):
        """
        Add query optimization context to serializer
        """
        context = super().get_serializer_context()
        context['optimize_queries'] = True
        return context


class PaginationOptimizationMixin:
    """
    Mixin to optimize pagination performance
    """
    
    def paginate_queryset(self, queryset):
        """
        Optimize pagination with count caching
        """
        # Cache count for expensive queries
        if hasattr(self, 'cache_count') and self.cache_count:
            cache_key = f"count:{self.__class__.__name__}:{hash(str(queryset.query))}"
            count = cache.get(cache_key)
            
            if count is None:
                count = queryset.count()
                cache.set(cache_key, count, 300)  # Cache for 5 minutes
            
            # Monkey patch the count for pagination
            queryset._result_cache = None
            queryset._count = count
        
        return super().paginate_queryset(queryset)


class ResponseCompressionMixin:
    """
    Mixin to add response compression hints
    """
    
    def finalize_response(self, request, response, *args, **kwargs):
        """
        Add compression hints to response
        """
        response = super().finalize_response(request, response, *args, **kwargs)
        
        # Only add compression hints if response is already rendered
        try:
            if hasattr(response, 'render') and not getattr(response, '_is_rendered', False):
                response.render()
            
            # Add compression hints for large responses
            if hasattr(response, 'content') and len(response.content) > 1024:
                response['X-Compress-Hint'] = 'true'
        except Exception as e:
            # Log error but don't break the response
            logger.warning(f"Error adding compression hints: {e}")
        
        return response


class OptimizedAPIViewMixin(
    CacheOptimizedMixin,
    PerformanceMonitoringMixin,
    QueryOptimizationMixin,
    PaginationOptimizationMixin,
    ResponseCompressionMixin
):
    """
    Combined mixin with all performance optimizations
    """
    
    def dispatch(self, request, *args, **kwargs):
        """
        Enhanced dispatch with caching and monitoring
        """
        # Try cache first for GET requests
        if request.method == 'GET':
            cached_response = self.get_cached_response(request, *args, **kwargs)
            if cached_response:
                return cached_response
        
        # Call parent dispatch (includes performance monitoring)
        response = super().dispatch(request, *args, **kwargs)
        
        # Cache successful GET responses
        if request.method == 'GET' and response.status_code == 200:
            self.cache_response(request, response, *args, **kwargs)
        
        # Invalidate cache for mutations
        if request.method in ['POST', 'PUT', 'PATCH', 'DELETE']:
            self.invalidate_related_cache(request, *args, **kwargs)
        
        return response
    
    def invalidate_related_cache(self, request, *args, **kwargs):
        """
        Invalidate related cache entries after mutations
        """
        # Override in subclasses to define specific invalidation patterns
        model_name = getattr(self, 'model', None)
        if model_name:
            pattern = model_name.__name__.lower()
            self.invalidate_cache_pattern(pattern)


# Decorator for view-level caching
def cache_api_response(timeout=300, vary_headers=None):
    """
    Decorator to cache API responses
    """
    if vary_headers is None:
        vary_headers = ['Authorization', 'Accept-Language']
    
    def decorator(view_func):
        @method_decorator(vary_on_headers(*vary_headers))
        @method_decorator(cache_page(timeout))
        def wrapped_view(self, request, *args, **kwargs):
            return view_func(self, request, *args, **kwargs)
        return wrapped_view
    return decorator


# Context manager for query monitoring
class QueryMonitor:
    """
    Context manager to monitor database queries
    """
    
    def __init__(self, description="Query"):
        self.description = description
        self.start_time = None
        self.start_queries = None
    
    def __enter__(self):
        from django.db import connection
        self.start_time = time.time()
        self.start_queries = len(connection.queries)
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        from django.db import connection
        end_time = time.time()
        end_queries = len(connection.queries)
        
        duration = end_time - self.start_time
        query_count = end_queries - self.start_queries
        
        logger.info(
            f"{self.description}: {duration:.3f}s, {query_count} queries"
        )
        
        # Log slow operations
        if duration > 1.0 or query_count > 10:
            logger.warning(
                f"Slow operation - {self.description}: "
                f"{duration:.3f}s, {query_count} queries"
            ) 