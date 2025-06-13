from django.db.models import Sum, Count, Q, F, Value, Case, When, Min, Max
from django.db.models.functions import TruncDate, TruncWeek, TruncMonth, Coalesce
from django.utils import timezone
from django.http import Http404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import generics
from datetime import datetime, timedelta
from decimal import Decimal
import logging

from .models import CustomView, ViewTransaction, Transaction, CustomCategory
from .serializers import TransactionSerializer
from .mixins import OptimizedAPIViewMixin

logger = logging.getLogger(__name__)

class CustomViewAnalyticsSummaryView(OptimizedAPIViewMixin, generics.RetrieveAPIView):
    """
    API endpoint to get summary analytics for a custom view
    """
    permission_classes = [IsAuthenticated]
    
    def get_object(self):
        """Get the custom view and verify ownership"""
        try:
            view_id = self.kwargs['view_id']
            custom_view = CustomView.objects.get(id=view_id, user=self.request.user)
            return custom_view
        except CustomView.DoesNotExist:
            raise Http404("Custom view not found")
    
    def retrieve(self, request, *args, **kwargs):
        """Get summary statistics for the custom view"""
        custom_view = self.get_object()
        
        # Get all transactions in this view
        view_transactions = ViewTransaction.objects.filter(
            custom_view=custom_view
        ).select_related('transaction')
        
        # Calculate summary statistics
        transactions_qs = Transaction.objects.filter(
            id__in=view_transactions.values_list('transaction_id', flat=True),
            user=request.user
        )
        
        # Basic aggregations
        summary_stats = transactions_qs.aggregate(
            total_transactions=Count('id'),
            total_spending=Coalesce(Sum('aud_amount'), Decimal('0')),
            total_inflow=Coalesce(Sum('aud_amount', filter=Q(direction='CREDIT')), Decimal('0')),
            total_outflow=Coalesce(Sum('aud_amount', filter=Q(direction='DEBIT')), Decimal('0')),
            earliest_date=Min('transaction_date'),
            latest_date=Max('transaction_date')
        )
        
        # Category distribution
        category_distribution = transactions_qs.values(
            'category__name'
        ).annotate(
            amount=Sum('aud_amount'),
            count=Count('id')
        ).order_by('-amount')[:10]  # Top 10 categories
        
        # Custom category distribution
        custom_category_distribution = view_transactions.values(
            'custom_category__name'
        ).annotate(
            amount=Sum('transaction__aud_amount'),
            count=Count('transaction')
        ).order_by('-amount')
        
        # Time period analysis
        date_range_days = 0
        if summary_stats['earliest_date'] and summary_stats['latest_date']:
            date_range_days = (summary_stats['latest_date'] - summary_stats['earliest_date']).days + 1
        
        # Average spending per day/week/month
        avg_daily = summary_stats['total_spending'] / max(date_range_days, 1) if date_range_days > 0 else Decimal('0')
        avg_weekly = avg_daily * 7
        avg_monthly = avg_daily * 30
        
        response_data = {
            'view_info': {
                'id': custom_view.id,
                'name': custom_view.name,
                'description': custom_view.description,
                'created_at': custom_view.created_at,
                'updated_at': custom_view.updated_at
            },
            'summary': {
                'total_transactions': summary_stats['total_transactions'],
                'total_spending': float(summary_stats['total_spending']),
                'total_inflow': float(summary_stats['total_inflow']),
                'total_outflow': float(summary_stats['total_outflow']),
                'net_flow': float(summary_stats['total_inflow'] - summary_stats['total_outflow']),
                'date_range': {
                    'earliest': summary_stats['earliest_date'],
                    'latest': summary_stats['latest_date'],
                    'days': date_range_days
                },
                'averages': {
                    'daily': float(avg_daily),
                    'weekly': float(avg_weekly),
                    'monthly': float(avg_monthly)
                }
            },
            'category_distribution': [
                {
                    'category': item['category__name'] or 'Uncategorized',
                    'amount': float(item['amount']),
                    'count': item['count'],
                    'percentage': float(item['amount'] / summary_stats['total_spending'] * 100) if summary_stats['total_spending'] > 0 else 0
                }
                for item in category_distribution
            ],
            'custom_category_distribution': [
                {
                    'category': item['custom_category__name'] or 'Uncategorized',
                    'amount': float(item['amount']),
                    'count': item['count'],
                    'percentage': float(item['amount'] / summary_stats['total_spending'] * 100) if summary_stats['total_spending'] > 0 else 0
                }
                for item in custom_category_distribution
            ],
            'metadata': {
                'generated_at': timezone.now(),
                'currency': 'AUD'
            }
        }
        
        return Response(response_data)


class CustomViewAnalyticsCategoriesView(OptimizedAPIViewMixin, generics.RetrieveAPIView):
    """
    API endpoint to get detailed category breakdown for a custom view
    """
    permission_classes = [IsAuthenticated]
    
    def get_object(self):
        """Get the custom view and verify ownership"""
        try:
            view_id = self.kwargs['view_id']
            custom_view = CustomView.objects.get(id=view_id, user=self.request.user)
            return custom_view
        except CustomView.DoesNotExist:
            raise Http404("Custom view not found")
    
    def retrieve(self, request, *args, **kwargs):
        """Get detailed category breakdown"""
        custom_view = self.get_object()
        
        # Get query parameters
        breakdown_type = request.query_params.get('type', 'custom')  # 'custom' or 'system'
        include_subcategories = request.query_params.get('subcategories', 'false').lower() == 'true'
        
        view_transactions = ViewTransaction.objects.filter(
            custom_view=custom_view
        ).select_related('transaction', 'custom_category')
        
        if breakdown_type == 'custom':
            # Custom category breakdown
            category_data = view_transactions.values(
                'custom_category__id',
                'custom_category__name',
                'custom_category__color'
            ).annotate(
                total_amount=Sum('transaction__aud_amount'),
                transaction_count=Count('transaction'),
                avg_amount=Sum('transaction__aud_amount') / Count('transaction')
            ).order_by('-total_amount')
        else:
            # System category breakdown
            category_data = view_transactions.values(
                'transaction__category__id',
                'transaction__category__name'
            ).annotate(
                total_amount=Sum('transaction__aud_amount'),
                transaction_count=Count('transaction'),
                avg_amount=Sum('transaction__aud_amount') / Count('transaction')
            ).order_by('-total_amount')
        
        # Calculate total for percentages
        total_amount = sum(item['total_amount'] for item in category_data if item['total_amount'])
        
        # Format response data
        categories = []
        for item in category_data:
            amount = float(item['total_amount']) if item['total_amount'] else 0
            percentage = (amount / float(total_amount) * 100) if total_amount > 0 else 0
            
            category_info = {
                'id': item.get('custom_category__id') or item.get('transaction__category__id'),
                'name': item.get('custom_category__name') or item.get('transaction__category__name') or 'Uncategorized',
                'amount': amount,
                'count': item['transaction_count'],
                'percentage': round(percentage, 2),
                'avg_amount': float(item['avg_amount']) if item['avg_amount'] else 0
            }
            
            if breakdown_type == 'custom' and item.get('custom_category__color'):
                category_info['color'] = item['custom_category__color']
            
            categories.append(category_info)
        
        response_data = {
            'view_id': custom_view.id,
            'breakdown_type': breakdown_type,
            'total_amount': float(total_amount),
            'categories': categories,
            'metadata': {
                'generated_at': timezone.now(),
                'currency': 'AUD',
                'include_subcategories': include_subcategories
            }
        }
        
        return Response(response_data)


class CustomViewAnalyticsTimelineView(OptimizedAPIViewMixin, generics.RetrieveAPIView):
    """
    API endpoint to get timeline analytics for a custom view
    """
    permission_classes = [IsAuthenticated]
    
    def get_object(self):
        """Get the custom view and verify ownership"""
        try:
            view_id = self.kwargs['view_id']
            custom_view = CustomView.objects.get(id=view_id, user=self.request.user)
            return custom_view
        except CustomView.DoesNotExist:
            raise Http404("Custom view not found")
    
    def retrieve(self, request, *args, **kwargs):
        """Get timeline data for the custom view"""
        custom_view = self.get_object()
        
        # Get query parameters
        period = request.query_params.get('period', 'monthly')  # daily, weekly, monthly
        category_filter = request.query_params.get('category')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        
        # Get transactions in this view
        view_transactions = ViewTransaction.objects.filter(
            custom_view=custom_view
        ).select_related('transaction')
        
        transactions_qs = Transaction.objects.filter(
            id__in=view_transactions.values_list('transaction_id', flat=True),
            user=request.user
        )
        
        # Apply date filters
        if start_date:
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
                transactions_qs = transactions_qs.filter(transaction_date__gte=start_date)
            except ValueError:
                pass
        
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
                transactions_qs = transactions_qs.filter(transaction_date__lte=end_date)
            except ValueError:
                pass
        
        # Apply category filter
        if category_filter:
            if category_filter.isdigit():
                # Filter by custom category ID
                view_transactions_filtered = view_transactions.filter(custom_category_id=category_filter)
                transactions_qs = transactions_qs.filter(
                    id__in=view_transactions_filtered.values_list('transaction_id', flat=True)
                )
            else:
                # Filter by category name
                transactions_qs = transactions_qs.filter(category__name__icontains=category_filter)
        
        # Group by time period
        if period == 'daily':
            time_field = TruncDate('transaction_date')
        elif period == 'weekly':
            time_field = TruncWeek('transaction_date')
        else:  # monthly
            time_field = TruncMonth('transaction_date')
        
        timeline_data = transactions_qs.annotate(
            period=time_field
        ).values('period').annotate(
            total_amount=Sum('aud_amount'),
            inflow=Sum('aud_amount', filter=Q(direction='CREDIT')),
            outflow=Sum('aud_amount', filter=Q(direction='DEBIT')),
            transaction_count=Count('id')
        ).order_by('period')
        
        # Format response data
        timeline = []
        for item in timeline_data:
            timeline.append({
                'period': item['period'],
                'total_amount': float(item['total_amount']) if item['total_amount'] else 0,
                'inflow': float(item['inflow']) if item['inflow'] else 0,
                'outflow': float(item['outflow']) if item['outflow'] else 0,
                'net_flow': float((item['inflow'] or 0) - (item['outflow'] or 0)),
                'transaction_count': item['transaction_count']
            })
        
        response_data = {
            'view_id': custom_view.id,
            'period': period,
            'timeline': timeline,
            'filters': {
                'category': category_filter,
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None
            },
            'metadata': {
                'generated_at': timezone.now(),
                'currency': 'AUD',
                'total_periods': len(timeline)
            }
        }
        
        return Response(response_data)


class CustomViewTransactionsView(OptimizedAPIViewMixin, generics.ListAPIView):
    """
    API endpoint to get filtered transactions for a custom view
    """
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Get transactions for the custom view with filters"""
        try:
            view_id = self.kwargs['view_id']
            custom_view = CustomView.objects.get(id=view_id, user=self.request.user)
        except CustomView.DoesNotExist:
            raise Http404("Custom view not found")
        
        # Get transactions in this view
        view_transactions = ViewTransaction.objects.filter(
            custom_view=custom_view
        ).values_list('transaction_id', flat=True)
        
        queryset = Transaction.objects.filter(
            id__in=view_transactions,
            user=self.request.user
        ).select_related('category', 'vendor').order_by('-transaction_date', '-created_at')
        
        # Apply filters from query parameters
        category_filter = self.request.query_params.get('category')
        if category_filter:
            queryset = queryset.filter(category__name__icontains=category_filter)
        
        start_date = self.request.query_params.get('start_date')
        if start_date:
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
                queryset = queryset.filter(transaction_date__gte=start_date)
            except ValueError:
                pass
        
        end_date = self.request.query_params.get('end_date')
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
                queryset = queryset.filter(transaction_date__lte=end_date)
            except ValueError:
                pass
        
        min_amount = self.request.query_params.get('min_amount')
        if min_amount:
            try:
                min_amount = Decimal(min_amount)
                queryset = queryset.filter(aud_amount__gte=min_amount)
            except (ValueError, TypeError):
                pass
        
        max_amount = self.request.query_params.get('max_amount')
        if max_amount:
            try:
                max_amount = Decimal(max_amount)
                queryset = queryset.filter(aud_amount__lte=max_amount)
            except (ValueError, TypeError):
                pass
        
        direction = self.request.query_params.get('direction')
        if direction in ['CREDIT', 'DEBIT']:
            queryset = queryset.filter(direction=direction)
        
        return queryset
    
    def list(self, request, *args, **kwargs):
        """Enhanced list response with additional metadata"""
        response = super().list(request, *args, **kwargs)
        
        # Add summary statistics to the response
        queryset = self.get_queryset()
        summary = queryset.aggregate(
            total_amount=Sum('aud_amount'),
            total_count=Count('id'),
            avg_amount=Sum('aud_amount') / Count('id')
        )
        
        response.data['summary'] = {
            'total_amount': float(summary['total_amount']) if summary['total_amount'] else 0,
            'total_count': summary['total_count'],
            'avg_amount': float(summary['avg_amount']) if summary['avg_amount'] else 0
        }
        
        return response 