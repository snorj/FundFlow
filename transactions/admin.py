from django.contrib import admin
from .models import (
    Category, Vendor, VendorMerge, VendorRule, SplitTransaction,
    CustomView, CustomCategory, ViewTransaction, Transaction,
    DescriptionMapping, HistoricalExchangeRate
)

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'parent', 'user', 'created_at')
    list_filter = ('user', 'created_at')
    search_fields = ('name',)
    ordering = ('name',)

@admin.register(Vendor)
class VendorAdmin(admin.ModelAdmin):
    list_display = ('display_name', 'name', 'user', 'created_at')
    list_filter = ('user', 'created_at')
    search_fields = ('name', 'display_name')
    ordering = ('display_name', 'name')

@admin.register(CustomView)
class CustomViewAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'is_archived', 'created_at', 'updated_at')
    list_filter = ('user', 'is_archived', 'created_at')
    search_fields = ('name', 'description')
    ordering = ('-updated_at',)
    readonly_fields = ('created_at', 'updated_at')

@admin.register(CustomCategory)
class CustomCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'custom_view', 'parent', 'order', 'created_at')
    list_filter = ('custom_view', 'created_at')
    search_fields = ('name',)
    ordering = ('custom_view', 'order', 'name')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(ViewTransaction)
class ViewTransactionAdmin(admin.ModelAdmin):
    list_display = ('transaction', 'custom_view', 'custom_category', 'assigned_at')
    list_filter = ('custom_view', 'custom_category', 'assigned_at')
    search_fields = ('transaction__description', 'custom_view__name', 'custom_category__name')
    ordering = ('-assigned_at',)
    readonly_fields = ('assigned_at', 'updated_at')
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'transaction', 'custom_view', 'custom_category'
        )

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('description', 'original_amount', 'original_currency', 'transaction_date', 'user', 'category', 'vendor')
    list_filter = ('user', 'category', 'vendor', 'original_currency', 'transaction_date', 'source')
    search_fields = ('description', 'vendor__name', 'category__name')
    ordering = ('-transaction_date', '-created_at')
    readonly_fields = ('created_at', 'updated_at', 'last_modified')

@admin.register(VendorRule)
class VendorRuleAdmin(admin.ModelAdmin):
    list_display = ('vendor', 'category', 'priority', 'is_persistent', 'created_at')
    list_filter = ('priority', 'is_persistent', 'created_at')
    search_fields = ('vendor__name', 'category__name', 'pattern')
    ordering = ('priority', '-created_at')

# Register other models with basic admin
admin.site.register(VendorMerge)
admin.site.register(SplitTransaction)
admin.site.register(DescriptionMapping)
admin.site.register(HistoricalExchangeRate)
