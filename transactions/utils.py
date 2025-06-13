# transactions/utils.py
"""
Database query optimization utilities for the transactions app.
"""

from django.db import connection
from django.db.models import QuerySet
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

def optimize_queryset_for_pagination(queryset: QuerySet, page_size: int = 25) -> QuerySet:
    """
    Optimize a queryset for pagination by adding appropriate select_related and prefetch_related.
    
    Args:
        queryset: The base queryset to optimize
        page_size: The page size for pagination hints
        
    Returns:
        Optimized queryset
    """
    model = queryset.model
    
    # Add model-specific optimizations
    if model.__name__ == 'Transaction':
        return queryset.select_related(
            'category', 'vendor', 'user', 'parent_transaction'
        ).prefetch_related(
            'split_transactions__category'
        )
    elif model.__name__ == 'Category':
        return queryset.select_related(
            'parent', 'user'
        ).prefetch_related(
            'children'
        )
    elif model.__name__ == 'Vendor':
        return queryset.select_related('user')
    elif model.__name__ == 'VendorRule':
        return queryset.select_related(
            'vendor', 'category'
        )
    
    return queryset

def log_query_performance(func):
    """
    Decorator to log database query performance for debugging.
    Only active when DEBUG=True.
    """
    def wrapper(*args, **kwargs):
        if not settings.DEBUG:
            return func(*args, **kwargs)
            
        initial_queries = len(connection.queries)
        result = func(*args, **kwargs)
        final_queries = len(connection.queries)
        
        query_count = final_queries - initial_queries
        if query_count > 10:  # Log if more than 10 queries
            logger.warning(
                f"High query count in {func.__name__}: {query_count} queries"
            )
        
        return result
    return wrapper

def get_database_stats():
    """
    Get current database connection statistics for monitoring.
    
    Returns:
        dict: Database statistics
    """
    stats = {
        'total_queries': len(connection.queries) if settings.DEBUG else 'N/A (DEBUG=False)',
        'connection_info': {
            'vendor': connection.vendor,
            'display_name': connection.display_name,
        }
    }
    
    if settings.DEBUG and connection.queries:
        # Analyze query patterns
        query_times = [float(q['time']) for q in connection.queries]
        stats['query_analysis'] = {
            'total_time': sum(query_times),
            'avg_time': sum(query_times) / len(query_times),
            'max_time': max(query_times),
            'slow_queries': len([t for t in query_times if t > 0.1])  # > 100ms
        }
    
    return stats

class QueryOptimizer:
    """
    Context manager for query optimization and monitoring.
    """
    
    def __init__(self, operation_name: str):
        self.operation_name = operation_name
        self.initial_query_count = 0
        
    def __enter__(self):
        if settings.DEBUG:
            self.initial_query_count = len(connection.queries)
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        if settings.DEBUG:
            final_query_count = len(connection.queries)
            query_count = final_query_count - self.initial_query_count
            
            if query_count > 5:
                logger.info(
                    f"Query count for {self.operation_name}: {query_count}"
                )
                
                # Log slow queries
                recent_queries = connection.queries[self.initial_query_count:]
                slow_queries = [q for q in recent_queries if float(q['time']) > 0.1]
                
                if slow_queries:
                    logger.warning(
                        f"Slow queries detected in {self.operation_name}: "
                        f"{len(slow_queries)} queries > 100ms"
                    )

def bulk_update_optimized(model_class, objects, fields, batch_size=1000):
    """
    Optimized bulk update that processes objects in batches.
    
    Args:
        model_class: The Django model class
        objects: List of model instances to update
        fields: List of field names to update
        batch_size: Number of objects to process per batch
        
    Returns:
        int: Total number of objects updated
    """
    total_updated = 0
    
    for i in range(0, len(objects), batch_size):
        batch = objects[i:i + batch_size]
        updated_count = model_class.objects.bulk_update(batch, fields, batch_size)
        total_updated += updated_count
        
        logger.debug(f"Updated batch {i//batch_size + 1}: {updated_count} objects")
    
    return total_updated

def get_index_usage_stats(table_name: str):
    """
    Get index usage statistics for a specific table (PostgreSQL only).
    
    Args:
        table_name: Name of the database table
        
    Returns:
        list: Index usage statistics
    """
    if connection.vendor != 'postgresql':
        return []
        
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT 
                indexname,
                idx_tup_read,
                idx_tup_fetch,
                idx_scan
            FROM pg_stat_user_indexes 
            WHERE relname = %s
            ORDER BY idx_scan DESC;
        """, [table_name])
        
        columns = [col[0] for col in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()] 