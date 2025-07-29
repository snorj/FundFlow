from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from transactions.models import Category, Vendor
import json

User = get_user_model()

class Command(BaseCommand):
    help = 'Test vendor assignment to categories'

    def handle(self, *args, **options):
        # Get or create demo user
        user, created = User.objects.get_or_create(
            username='demo',
            defaults={'email': 'demo@example.com'}
        )
        if created:
            user.set_password('demo')
            user.save()
            self.stdout.write('Created demo user')
        
        # Create a test category
        category, created = Category.objects.get_or_create(
            name='Test Food',
            user=user,
            defaults={'parent': None}
        )
        if created:
            self.stdout.write(f'Created category: {category.name}')
        
        # Create a test vendor and assign it to the category
        vendor, created = Vendor.objects.get_or_create(
            name='Test McDonald\'s',
            user=user,
            defaults={
                'display_name': 'McDonald\'s Restaurant',
                'parent_category': category
            }
        )
        if created:
            self.stdout.write(f'Created vendor: {vendor.name} assigned to {category.name}')
        else:
            # Update existing vendor to ensure it has the right parent
            vendor.parent_category = category
            vendor.save()
            self.stdout.write(f'Updated vendor: {vendor.name} assigned to {category.name}')
        
        # Test the API response structure
        from transactions.views import CategoryListCreateView
        from rest_framework.test import APIRequestFactory
        
        factory = APIRequestFactory()
        request = factory.get('/api/categories/')
        request.user = user
        
        view = CategoryListCreateView()
        view.setup(request)
        response = view.list(request)
        
        self.stdout.write('\n--- API Response Analysis ---')
        data = response.data
        if 'results' in data:
            results = data['results']
            self.stdout.write(f'Total items in results: {len(results)}')
            
            categories = [item for item in results if not item.get('type') or item.get('type') == 'category']
            vendors = [item for item in results if item.get('type') == 'vendor']
            
            self.stdout.write(f'Categories: {len(categories)}')
            self.stdout.write(f'Vendors: {len(vendors)}')
            
            if vendors:
                self.stdout.write('\nVendor details:')
                for v in vendors:
                    self.stdout.write(f'  - {v["name"]} (ID: {v["id"]}, Parent: {v["parent"]})')
            else:
                self.stdout.write('❌ No vendors found in API response!')
                
            # Check if our test vendor is in the response
            test_vendor_in_response = any(v.get('name') == 'McDonald\'s Restaurant' for v in vendors)
            if test_vendor_in_response:
                self.stdout.write('✅ Test vendor found in API response')
            else:
                self.stdout.write('❌ Test vendor NOT found in API response')
        else:
            self.stdout.write(f'No results key found. Response keys: {list(data.keys())}')
        
        self.stdout.write('\n--- Database State ---')
        self.stdout.write(f'Categories in DB: {Category.objects.filter(user=user).count()}')
        self.stdout.write(f'Vendors in DB: {Vendor.objects.filter(user=user).count()}')
        
        # Show vendor-category relationships
        for vendor_obj in Vendor.objects.filter(user=user):
            parent_name = vendor_obj.parent_category.name if vendor_obj.parent_category else 'None'
            self.stdout.write(f'  {vendor_obj.name} -> {parent_name}') 