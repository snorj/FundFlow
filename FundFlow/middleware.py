import gzip
import hashlib
import json
import time
from django.http import HttpResponse
from django.utils.cache import patch_cache_control
from django.utils.deprecation import MiddlewareMixin
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

class ResponseOptimizationMiddleware(MiddlewareMixin):
    """
    Middleware for optimizing API responses with compression, ETags, and cache headers
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
        self.compression_threshold = getattr(settings, 'COMPRESSION_THRESHOLD', 1024)
        self.etag_enabled = getattr(settings, 'ETAG_ENABLED', True)
        self.cache_timeout = getattr(settings, 'API_CACHE_TIMEOUT', 300)  # 5 minutes
        super().__init__(get_response)

    def process_response(self, request, response):
        """
        Process response to add compression, ETags, and cache headers
        """
        # Only process API responses
        if not request.path.startswith('/api/'):
            return response
            
        # Skip for non-successful responses
        if response.status_code >= 400:
            return response
            
        # Add performance headers
        self.add_performance_headers(request, response)
        
        # Add ETag for GET requests
        if request.method == 'GET' and self.etag_enabled:
            self.add_etag(request, response)
            
        # Add cache headers
        self.add_cache_headers(request, response)
        
        # Compress response if applicable
        self.compress_response(request, response)
        
        return response

    def add_performance_headers(self, request, response):
        """
        Add performance-related headers
        """
        # Add timing header if available
        if hasattr(request, '_start_time'):
            duration = time.time() - request._start_time
            response['X-Response-Time'] = f"{duration:.3f}s"
            
        # Add content size header
        if hasattr(response, 'content'):
            response['X-Content-Size'] = str(len(response.content))
            
        # Add server info
        response['X-Powered-By'] = 'FundFlow API'

    def add_etag(self, request, response):
        """
        Add ETag header for caching
        """
        if not hasattr(response, 'content') or not response.content:
            return
            
        # Generate ETag from content hash
        content_hash = hashlib.md5(response.content).hexdigest()
        etag = f'"{content_hash}"'
        
        # Check if client has matching ETag
        client_etag = request.META.get('HTTP_IF_NONE_MATCH')
        if client_etag == etag:
            # Return 304 Not Modified
            response.status_code = 304
            response.content = b''
            response['Content-Length'] = '0'
        else:
            response['ETag'] = etag

    def add_cache_headers(self, request, response):
        """
        Add appropriate cache headers based on request type
        """
        if request.method == 'GET':
            # Cache GET requests
            if 'search' in request.path or 'filter' in request.GET:
                # Short cache for search/filter results
                patch_cache_control(response, max_age=60, private=True)
            elif any(resource in request.path for resource in ['categories', 'vendors']):
                # Longer cache for relatively static data
                patch_cache_control(response, max_age=self.cache_timeout, private=True)
            else:
                # Default cache for other GET requests
                patch_cache_control(response, max_age=self.cache_timeout // 2, private=True)
                
            # Add Vary header for content negotiation
            response['Vary'] = 'Accept, Accept-Encoding, Authorization'
        else:
            # No cache for non-GET requests
            patch_cache_control(response, no_cache=True, no_store=True, must_revalidate=True)

    def compress_response(self, request, response):
        """
        Compress response if client supports it and content is large enough
        """
        # Check if client accepts gzip
        accept_encoding = request.META.get('HTTP_ACCEPT_ENCODING', '')
        if 'gzip' not in accept_encoding.lower():
            return
            
        # Check content type
        content_type = response.get('Content-Type', '')
        compressible_types = [
            'application/json',
            'text/html',
            'text/css',
            'text/javascript',
            'application/javascript',
            'text/xml',
            'application/xml'
        ]
        
        if not any(ct in content_type for ct in compressible_types):
            return
            
        # Check content size
        if not hasattr(response, 'content') or len(response.content) < self.compression_threshold:
            return
            
        # Skip if already compressed
        if response.get('Content-Encoding'):
            return
            
        try:
            # Compress content
            compressed_content = gzip.compress(response.content)
            
            # Only use compression if it actually reduces size
            if len(compressed_content) < len(response.content):
                response.content = compressed_content
                response['Content-Encoding'] = 'gzip'
                response['Content-Length'] = str(len(compressed_content))
                
                # Add compression ratio header for monitoring
                ratio = len(compressed_content) / len(response.content) * 100
                response['X-Compression-Ratio'] = f"{ratio:.1f}%"
                
        except Exception as e:
            logger.warning(f"Compression failed: {e}")

    def process_request(self, request):
        """
        Process request to add timing information
        """
        request._start_time = time.time()
        return None


class PartialResponseMiddleware(MiddlewareMixin):
    """
    Middleware to support partial responses with field selection
    """
    
    def process_response(self, request, response):
        """
        Process response to support field selection
        """
        # Only process API JSON responses
        if not request.path.startswith('/api/'):
            return response
            
        if response.status_code != 200:
            return response
            
        content_type = response.get('Content-Type', '')
        if 'application/json' not in content_type:
            return response
            
        # Check for fields parameter
        fields_param = request.GET.get('fields')
        if not fields_param:
            return response
            
        try:
            # Parse requested fields
            requested_fields = [field.strip() for field in fields_param.split(',')]
            
            # Parse response content
            data = json.loads(response.content.decode('utf-8'))
            
            # Filter data based on requested fields
            filtered_data = self.filter_fields(data, requested_fields)
            
            # Update response
            response.content = json.dumps(filtered_data).encode('utf-8')
            response['Content-Length'] = str(len(response.content))
            
            # Add header indicating partial response
            response['X-Partial-Response'] = 'true'
            response['X-Selected-Fields'] = fields_param
            
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"Partial response processing failed: {e}")
            
        return response
    
    def filter_fields(self, data, fields):
        """
        Filter data to include only requested fields
        """
        if isinstance(data, dict):
            # Handle single object
            return {key: value for key, value in data.items() if key in fields}
        elif isinstance(data, list):
            # Handle list of objects
            return [self.filter_fields(item, fields) for item in data]
        elif isinstance(data, dict) and 'results' in data:
            # Handle paginated response
            filtered_data = data.copy()
            filtered_data['results'] = [
                self.filter_fields(item, fields) for item in data['results']
            ]
            return filtered_data
        else:
            return data


class RequestBatchingMiddleware(MiddlewareMixin):
    """
    Middleware to support request batching
    """
    
    def process_view(self, request, view_func, view_args, view_kwargs):
        """
        Process batch requests
        """
        # Only handle POST requests to batch endpoint
        if request.method != 'POST' or not request.path.endswith('/batch/'):
            return None
            
        try:
            # Parse batch request
            batch_data = json.loads(request.body.decode('utf-8'))
            requests_list = batch_data.get('requests', [])
            
            if not isinstance(requests_list, list):
                return HttpResponse(
                    json.dumps({'error': 'Invalid batch format'}),
                    status=400,
                    content_type='application/json'
                )
            
            # Process each request in the batch
            results = []
            for req_data in requests_list:
                try:
                    result = self.process_batch_request(request, req_data)
                    results.append(result)
                except Exception as e:
                    results.append({
                        'error': str(e),
                        'status': 500
                    })
            
            # Return batch response
            response_data = {
                'results': results,
                'count': len(results)
            }
            
            return HttpResponse(
                json.dumps(response_data),
                content_type='application/json'
            )
            
        except (json.JSONDecodeError, Exception) as e:
            return HttpResponse(
                json.dumps({'error': f'Batch processing failed: {str(e)}'}),
                status=400,
                content_type='application/json'
            )
    
    def process_batch_request(self, original_request, req_data):
        """
        Process individual request within batch
        """
        from django.test import RequestFactory
        from django.urls import resolve
        
        # Create new request object
        factory = RequestFactory()
        method = req_data.get('method', 'GET').upper()
        url = req_data.get('url', '')
        data = req_data.get('data', {})
        headers = req_data.get('headers', {})
        
        # Create request
        if method == 'GET':
            new_request = factory.get(url, data)
        elif method == 'POST':
            new_request = factory.post(url, data, content_type='application/json')
        elif method == 'PUT':
            new_request = factory.put(url, data, content_type='application/json')
        elif method == 'PATCH':
            new_request = factory.patch(url, data, content_type='application/json')
        elif method == 'DELETE':
            new_request = factory.delete(url)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        # Copy authentication and session from original request
        new_request.user = original_request.user
        new_request.session = original_request.session
        
        # Add custom headers
        for key, value in headers.items():
            new_request.META[f'HTTP_{key.upper().replace("-", "_")}'] = value
        
        try:
            # Resolve URL and call view
            resolver_match = resolve(url)
            view_func = resolver_match.func
            response = view_func(new_request, *resolver_match.args, **resolver_match.kwargs)
            
            # Parse response
            if hasattr(response, 'content'):
                try:
                    data = json.loads(response.content.decode('utf-8'))
                except json.JSONDecodeError:
                    data = response.content.decode('utf-8')
            else:
                data = None
            
            return {
                'status': response.status_code,
                'data': data,
                'headers': dict(response.items())
            }
            
        except Exception as e:
            return {
                'status': 500,
                'error': str(e)
            }


class APIPerformanceMonitoringMiddleware(MiddlewareMixin):
    """
    Middleware for monitoring API performance
    """
    
    def process_request(self, request):
        """
        Start performance monitoring
        """
        if request.path.startswith('/api/'):
            request._perf_start = time.time()
        return None
    
    def process_response(self, request, response):
        """
        Log performance metrics
        """
        if not request.path.startswith('/api/') or not hasattr(request, '_perf_start'):
            return response
            
        # Calculate metrics
        duration = time.time() - request._perf_start
        
        # Add performance headers
        response['X-Response-Time'] = f"{duration:.3f}s"
        
        # Log slow requests
        if duration > 1.0:  # Log requests taking more than 1 second
            logger.warning(
                f"Slow API request: {request.method} {request.path} "
                f"took {duration:.3f}s"
            )
        
        # Log performance metrics for monitoring
        logger.info(
            f"API Performance: {request.method} {request.path} "
            f"- {duration:.3f}s - {response.status_code}"
        )
        
        return response 