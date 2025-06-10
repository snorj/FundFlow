import uuid
from decimal import Decimal
from datetime import datetime, timedelta
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from transactions.models import Category, Vendor, Transaction, VendorRule
from django.utils import timezone
import random

User = get_user_model()

class Command(BaseCommand):
    help = 'Create a demo user with comprehensive sample data for testing the categorization interface'

    def add_arguments(self, parser):
        parser.add_argument('--username', default='demo', help='Username for the demo user')
        parser.add_argument('--email', default='demo@fundflow.local', help='Email for the demo user')
        parser.add_argument('--password', default='demo123', help='Password for the demo user')

    def handle(self, *args, **options):
        username = options['username']
        email = options['email']
        password = options['password']

        # Create or get the demo user
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                'email': email,
                'base_currency': 'AUD',
                'first_name': 'Demo',
                'last_name': 'User'
            }
        )
        
        if created:
            user.set_password(password)
            user.save()
            self.stdout.write(f"Created demo user: {username}")
        else:
            self.stdout.write(f"Using existing demo user: {username}")

        # Clear existing data for this user
        Category.objects.filter(user=user).delete()
        Vendor.objects.filter(user=user).delete()
        Transaction.objects.filter(user=user).delete()

        # Create categories
        categories = self.create_categories(user)
        
        # Create vendors
        vendors = self.create_vendors(user)
        
        # Create transactions
        transactions = self.create_transactions(user, categories, vendors)
        
        # Create vendor rules
        self.create_vendor_rules(user, categories, vendors)

        self.stdout.write(
            self.style.SUCCESS(
                f'Successfully created demo data:\n'
                f'- User: {username} (password: {password})\n'
                f'- Categories: {len(categories)}\n'
                f'- Vendors: {len(vendors)}\n'
                f'- Transactions: {len(transactions)}\n'
                f'- Login at: http://localhost:3000/login\n'
                f'- Navigate to: Smart Categorize in sidebar'
            )
        )

    def create_categories(self, user):
        """Create a realistic category hierarchy"""
        categories = {}
        
        # Top-level categories
        top_level = [
            'Food & Dining',
            'Transportation',
            'Shopping',
            'Entertainment',
            'Bills & Utilities',
            'Healthcare',
            'Income',
            'Financial',
            'Home & Garden',
            'Travel',
            'Education',
            'Personal Care',
            'Uncategorized'
        ]
        
        for name in top_level:
            cat = Category.objects.create(
                name=name,
                user=user
            )
            categories[name] = cat

        # Sub-categories
        subcategories = {
            'Food & Dining': [
                'Groceries', 'Restaurants', 'Coffee & Tea', 'Fast Food', 
                'Alcohol & Bars', 'Food Delivery'
            ],
            'Transportation': [
                'Public Transport', 'Petrol', 'Car Maintenance', 'Parking', 
                'Rideshare', 'Car Insurance'
            ],
            'Shopping': [
                'Clothing', 'Electronics', 'Online Shopping', 'Department Stores',
                'Hardware & Tools', 'Books & Media'
            ],
            'Entertainment': [
                'Movies & Cinema', 'Streaming Services', 'Games', 'Events & Concerts',
                'Sports & Fitness', 'Hobbies'
            ],
            'Bills & Utilities': [
                'Electricity', 'Gas', 'Water', 'Internet', 'Phone', 'Insurance'
            ],
            'Healthcare': [
                'Medical', 'Dental', 'Pharmacy', 'Mental Health', 'Health Insurance'
            ],
            'Income': [
                'Salary', 'Freelance', 'Investments', 'Refunds', 'Government Benefits'
            ],
            'Financial': [
                'Bank Fees', 'Interest', 'Transfers', 'Investments', 'ATM Fees'
            ],
            'Home & Garden': [
                'Rent/Mortgage', 'Home Improvement', 'Furniture', 'Garden & Plants'
            ],
            'Travel': [
                'Flights', 'Accommodation', 'Travel Insurance', 'Tours & Activities'
            ]
        }
        
        for parent_name, children in subcategories.items():
            parent = categories[parent_name]
            for child_name in children:
                child = Category.objects.create(
                    name=child_name,
                    parent=parent,
                    user=user
                )
                categories[f"{parent_name}>{child_name}"] = child

        return categories

    def create_vendors(self, user):
        """Create realistic Australian vendors"""
        vendors_data = [
            # Groceries
            {'name': 'Woolworths', 'display_name': 'Woolworths Supermarket', 'patterns': ['woolworths', 'woolies']},
            {'name': 'Coles', 'display_name': 'Coles Supermarket', 'patterns': ['coles']},
            {'name': 'IGA', 'display_name': 'IGA', 'patterns': ['iga', 'independent grocers']},
            {'name': 'Aldi', 'display_name': 'ALDI', 'patterns': ['aldi']},
            
            # Coffee & Restaurants
            {'name': 'Coffee Club', 'display_name': 'The Coffee Club', 'patterns': ['coffee club']},
            {'name': 'McDonalds', 'display_name': "McDonald's", 'patterns': ['mcdonald', 'mcdonalds']},
            {'name': 'Subway', 'display_name': 'Subway', 'patterns': ['subway']},
            {'name': 'Guzman Y Gomez', 'display_name': 'Guzman y Gomez', 'patterns': ['guzman', 'gyg']},
            
            # Petrol
            {'name': 'Caltex', 'display_name': 'Caltex', 'patterns': ['caltex', 'ampol']},
            {'name': 'Shell', 'display_name': 'Shell', 'patterns': ['shell']},
            {'name': '7-Eleven', 'display_name': '7-Eleven', 'patterns': ['7-eleven', '7eleven']},
            
            # Utilities
            {'name': 'AGL', 'display_name': 'AGL Energy', 'patterns': ['agl']},
            {'name': 'Telstra', 'display_name': 'Telstra', 'patterns': ['telstra']},
            {'name': 'Optus', 'display_name': 'Optus', 'patterns': ['optus']},
            
            # Department Stores
            {'name': 'Target', 'display_name': 'Target Australia', 'patterns': ['target']},
            {'name': 'Kmart', 'display_name': 'Kmart', 'patterns': ['kmart']},
            {'name': 'Big W', 'display_name': 'BIG W', 'patterns': ['big w', 'bigw']},
            
            # Online
            {'name': 'Amazon', 'display_name': 'Amazon Australia', 'patterns': ['amazon']},
            {'name': 'eBay', 'display_name': 'eBay', 'patterns': ['ebay']},
            
            # Financial
            {'name': 'Commonwealth Bank', 'display_name': 'Commonwealth Bank', 'patterns': ['commbank', 'cba']},
            {'name': 'Westpac', 'display_name': 'Westpac', 'patterns': ['westpac']},
        ]
        
        vendors = {}
        for vendor_data in vendors_data:
            vendor = Vendor.objects.create(
                name=vendor_data['name'],
                display_name=vendor_data['display_name'],
                description_patterns=vendor_data['patterns'],
                user=user
            )
            vendors[vendor_data['name']] = vendor
            
        return vendors

    def create_transactions(self, user, categories, vendors):
        """Create realistic transactions over the past 3 months"""
        transactions = []
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=90)
        
        # Transaction templates with realistic Australian spending patterns
        transaction_templates = [
            # Groceries (weekly)
            {'vendor': 'Woolworths', 'category': 'Food & Dining>Groceries', 'amount_range': (80, 180), 'frequency': 'weekly', 'descriptions': [
                'WOOLWORTHS 1234 SYDNEY NS', 'WOOLWORTHS METRO KING ST', 'WOOLWORTHS BONDI BEACH'
            ]},
            {'vendor': 'Coles', 'category': 'Food & Dining>Groceries', 'amount_range': (70, 160), 'frequency': 'weekly', 'descriptions': [
                'COLES 5678 MELBOURNE VI', 'COLES EXPRESS FLINDERS', 'COLES SOUTHBANK'
            ]},
            
            # Coffee (frequent)
            {'vendor': 'Coffee Club', 'category': 'Food & Dining>Coffee & Tea', 'amount_range': (4, 15), 'frequency': 'frequent', 'descriptions': [
                'THE COFFEE CLUB SYDNEY', 'COFFEE CLUB MELBOURNE', 'TCC BRISBANE CITY'
            ]},
            
            # Fast Food
            {'vendor': 'McDonalds', 'category': 'Food & Dining>Fast Food', 'amount_range': (8, 25), 'frequency': 'occasional', 'descriptions': [
                'MCDONALDS GEORGE ST', 'MCDONALDS COLLINS ST', 'MCDONALDS QUEEN ST'
            ]},
            {'vendor': 'Subway', 'category': 'Food & Dining>Fast Food', 'amount_range': (10, 18), 'frequency': 'occasional', 'descriptions': [
                'SUBWAY CENTRAL STATION', 'SUBWAY FLINDERS STREET', 'SUBWAY KING STREET'
            ]},
            
            # Petrol
            {'vendor': 'Caltex', 'category': 'Transportation>Petrol', 'amount_range': (45, 85), 'frequency': 'biweekly', 'descriptions': [
                'CALTEX WOOLWORTHS SYDNEY', 'AMPOL MELBOURNE CBD', 'CALTEX BRISBANE NORTH'
            ]},
            {'vendor': 'Shell', 'category': 'Transportation>Petrol', 'amount_range': (40, 80), 'frequency': 'biweekly', 'descriptions': [
                'SHELL COLES EXPRESS SYD', 'SHELL MELBOURNE SOUTH', 'SHELL BRISBANE EAST'
            ]},
            
            # Utilities (monthly)
            {'vendor': 'AGL', 'category': 'Bills & Utilities>Electricity', 'amount_range': (120, 280), 'frequency': 'monthly', 'descriptions': [
                'AGL ELECTRICITY BILL', 'AGL ENERGY DIRECT DEBIT'
            ]},
            {'vendor': 'Telstra', 'category': 'Bills & Utilities>Phone', 'amount_range': (65, 120), 'frequency': 'monthly', 'descriptions': [
                'TELSTRA MOBILE POST PAID', 'TELSTRA INTERNET PLAN'
            ]},
            
            # Shopping
            {'vendor': 'Amazon', 'category': 'Shopping>Online Shopping', 'amount_range': (25, 150), 'frequency': 'occasional', 'descriptions': [
                'AMAZON.COM.AU PURCHASE', 'AMAZON MARKETPLACE', 'AMAZON PRIME VIDEO'
            ]},
            {'vendor': 'Target', 'category': 'Shopping>Department Stores', 'amount_range': (30, 120), 'frequency': 'occasional', 'descriptions': [
                'TARGET AUSTRALIA SYDNEY', 'TARGET MELBOURNE CBD', 'TARGET BRISBANE CITY'
            ]},
            
            # Income (fortnightly salary)
            {'vendor': 'Commonwealth Bank', 'category': 'Income>Salary', 'amount_range': (2800, 3200), 'frequency': 'fortnightly', 'descriptions': [
                'SALARY DEPOSIT FROM EMPLOYER', 'PAYROLL DEPOSIT CBA'
            ], 'is_credit': True},
        ]
        
        # Generate transactions based on templates
        current_date = start_date
        
        while current_date <= end_date:
            for template in transaction_templates:
                should_create = False
                
                if template['frequency'] == 'weekly' and current_date.weekday() == 1:  # Tuesday
                    should_create = True
                elif template['frequency'] == 'biweekly' and current_date.weekday() == 3 and current_date.day <= 14:  # Every other Thursday
                    should_create = True
                elif template['frequency'] == 'monthly' and current_date.day == 15:  # 15th of each month
                    should_create = True
                elif template['frequency'] == 'fortnightly' and current_date.weekday() == 4 and (current_date.day <= 7 or 21 <= current_date.day <= 28):  # Alternate Fridays
                    should_create = True
                elif template['frequency'] == 'frequent' and random.random() < 0.3:  # 30% chance daily
                    should_create = True
                elif template['frequency'] == 'occasional' and random.random() < 0.1:  # 10% chance daily
                    should_create = True
                
                if should_create:
                    vendor = vendors[template['vendor']]
                    category_path = template['category']
                    category = categories.get(category_path)
                    
                    if category:
                        amount = Decimal(str(random.uniform(*template['amount_range']))).quantize(Decimal('0.01'))
                        description = random.choice(template['descriptions'])
                        direction = 'CREDIT' if template.get('is_credit') else 'DEBIT'
                        
                        transaction = Transaction.objects.create(
                            user=user,
                            category=category,
                            vendor=vendor,
                            transaction_date=current_date,
                            description=description,
                            original_amount=amount,
                            original_currency='AUD',
                            aud_amount=amount,
                            exchange_rate_to_aud=Decimal('1.0'),
                            account_base_currency='AUD',
                            direction=direction,
                            source='csv'
                        )
                        transactions.append(transaction)
            
            current_date += timedelta(days=1)

        # Add some uncategorized transactions
        uncategorized_transactions = [
            {'description': 'ATM WITHDRAWAL WESTPAC', 'amount': 100, 'vendor': 'Westpac'},
            {'description': 'PAYPAL TRANSFER', 'amount': 45.50, 'vendor': None},
            {'description': 'INTERNATIONAL TRANSACTION FEE', 'amount': 3.50, 'vendor': 'Commonwealth Bank'},
            {'description': 'UBER EATS DELIVERY', 'amount': 32.80, 'vendor': None},
            {'description': 'SPOTIFY PREMIUM', 'amount': 11.99, 'vendor': None},
            {'description': 'NETFLIX SUBSCRIPTION', 'amount': 19.99, 'vendor': None},
        ]
        
        for i, uncategorized in enumerate(uncategorized_transactions):
            date = end_date - timedelta(days=random.randint(1, 30))
            vendor = vendors.get(uncategorized['vendor']) if uncategorized['vendor'] else None
            
            transaction = Transaction.objects.create(
                user=user,
                category=categories['Uncategorized'],  # Some uncategorized
                vendor=vendor,
                transaction_date=date,
                description=uncategorized['description'],
                original_amount=Decimal(str(uncategorized['amount'])),
                original_currency='AUD',
                aud_amount=Decimal(str(uncategorized['amount'])),
                exchange_rate_to_aud=Decimal('1.0'),
                account_base_currency='AUD',
                direction='DEBIT',
                source='csv'
            )
            transactions.append(transaction)

        return transactions

    def create_vendor_rules(self, user, categories, vendors):
        """Create some vendor categorization rules"""
        rules = [
            {'vendor': 'Woolworths', 'category': 'Food & Dining>Groceries', 'pattern': None, 'persistent': True},
            {'vendor': 'Coles', 'category': 'Food & Dining>Groceries', 'pattern': None, 'persistent': True},
            {'vendor': 'Coffee Club', 'category': 'Food & Dining>Coffee & Tea', 'pattern': None, 'persistent': True},
            {'vendor': 'Caltex', 'category': 'Transportation>Petrol', 'pattern': None, 'persistent': True},
            {'vendor': 'AGL', 'category': 'Bills & Utilities>Electricity', 'pattern': None, 'persistent': True},
        ]
        
        for rule_data in rules:
            vendor = vendors.get(rule_data['vendor'])
            category_path = rule_data['category']
            category = categories.get(category_path)
            
            if vendor and category:
                VendorRule.objects.create(
                    id=str(uuid.uuid4()),
                    vendor=vendor,
                    category=category,
                    pattern=rule_data['pattern'],
                    is_persistent=rule_data['persistent'],
                    priority=2  # High priority
                ) 