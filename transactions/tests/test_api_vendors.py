from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from ..models import Vendor, Transaction

User = get_user_model()

class VendorAPITests(APITestCase):
    """
    Tests for the Vendor API endpoints (/api/vendors/).
    """

    @classmethod
    def setUpTestData(cls):
        """Set up data for the whole test class."""
        cls.user1 = User.objects.create_user(username='user1', password='password123')
        cls.user2 = User.objects.create_user(username='user2', password='password123')

        # Create system vendors (user=None)
        cls.vendor_system_woolworths = Vendor.objects.create(name='Woolworths', user=None)
        cls.vendor_system_shell = Vendor.objects.create(name='Shell', user=None)

        # Create user1 vendors
        cls.vendor_user1_coffee = Vendor.objects.create(name='My Coffee Shop', user=cls.user1)
        cls.vendor_user1_bakery = Vendor.objects.create(name='Local Bakery', user=cls.user1)

        # Create user2 vendor
        cls.vendor_user2_restaurant = Vendor.objects.create(name='User2 Restaurant', user=cls.user2)

        # URLs
        cls.list_create_url = reverse('vendor-list-create')
        # Detail URL requires a PK, generated dynamically in tests

        # Verification assertion
        expected_count = 5  # 2 system + 2 user1 + 1 user2
        actual_count = Vendor.objects.count()
        assert actual_count == expected_count, f"Expected {expected_count} vendors after setUpTestData, but found {actual_count}"

    def setUp(self):
        """Authenticate user1 for most tests and assign data to self."""
        self.client.force_authenticate(user=self.user1)
        # Assign class data to instance for easier access via self.
        self.user1 = VendorAPITests.user1
        self.user2 = VendorAPITests.user2
        self.vendor_system_woolworths = VendorAPITests.vendor_system_woolworths
        self.vendor_system_shell = VendorAPITests.vendor_system_shell
        self.vendor_user1_coffee = VendorAPITests.vendor_user1_coffee
        self.vendor_user1_bakery = VendorAPITests.vendor_user1_bakery
        self.vendor_user2_restaurant = VendorAPITests.vendor_user2_restaurant

    # === List Vendors Tests (GET /api/vendors/) ===

    def test_list_vendors_authenticated(self):
        response = self.client.get(self.list_create_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Check based on paginated results
        self.assertIn('results', response.data)
        self.assertEqual(response.data['count'], 4)  # 2 system + 2 user1
        results_list = response.data['results']
        self.assertEqual(len(results_list), 4)

        vendor_names = [vendor['name'] for vendor in results_list]
        self.assertIn(self.vendor_system_woolworths.name, vendor_names)
        self.assertIn(self.vendor_system_shell.name, vendor_names)
        self.assertIn(self.vendor_user1_coffee.name, vendor_names)
        self.assertIn(self.vendor_user1_bakery.name, vendor_names)
        self.assertNotIn(self.vendor_user2_restaurant.name, vendor_names)  # User 2's excluded

    def test_list_vendors_unauthenticated(self):
        self.client.logout()
        response = self.client.get(self.list_create_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_vendors_ordering(self):
        response = self.client.get(self.list_create_url + '?ordering=name')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results_list = response.data['results']
        vendor_names = [vendor['name'] for vendor in results_list]
        # Should be alphabetically sorted
        self.assertEqual(vendor_names, sorted(vendor_names))

    # === Create Vendor Tests (POST /api/vendors/) ===

    def test_create_vendor_success(self):
        data = {'name': 'New Test Vendor'}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'New Test Vendor')
        self.assertEqual(response.data['user'], self.user1.id)
        self.assertFalse(response.data['is_system_vendor'])
        self.assertTrue(Vendor.objects.filter(name='New Test Vendor', user=self.user1).exists())

    def test_create_vendor_fail_missing_name(self):
        data = {}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)

    def test_create_vendor_fail_empty_name(self):
        data = {'name': ''}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)

    def test_create_vendor_fail_duplicate_name(self):
        data = {'name': 'My Coffee Shop'}  # Already exists for user1
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)
        self.assertTrue(any('already exists' in msg.lower() for msg in response.data['name']))

    def test_create_vendor_unauthenticated(self):
        self.client.logout()
        data = {'name': 'Test Unauth Vendor'}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # === Retrieve Vendor Detail Tests (GET /api/vendors/{id}/) ===

    def test_retrieve_system_vendor(self):
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_system_woolworths.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.vendor_system_woolworths.name)
        self.assertTrue(response.data['is_system_vendor'])
        self.assertIsNone(response.data['user'])

    def test_retrieve_own_vendor(self):
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_user1_coffee.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.vendor_user1_coffee.name)
        self.assertEqual(response.data['user'], self.user1.id)
        self.assertFalse(response.data['is_system_vendor'])

    def test_retrieve_fail_other_user_vendor(self):
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_user2_restaurant.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_fail_non_existent(self):
        url = reverse('vendor-detail', kwargs={'pk': 9999})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_unauthenticated(self):
        self.client.logout()
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_system_woolworths.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # === Update Vendor Tests (PUT/PATCH /api/vendors/{id}/) ===

    def test_update_own_vendor_name(self):
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_user1_coffee.id})
        data = {'name': 'Updated Coffee Shop'}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Updated Coffee Shop')
        self.vendor_user1_coffee.refresh_from_db()
        self.assertEqual(self.vendor_user1_coffee.name, 'Updated Coffee Shop')

    def test_update_fail_system_vendor(self):
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_system_woolworths.id})
        data = {'name': 'Cannot Update This'}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_fail_other_user_vendor(self):
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_user2_restaurant.id})
        data = {'name': 'Cannot Update This'}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_update_fail_duplicate_name(self):
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_user1_coffee.id})
        data = {'name': 'Local Bakery'}  # Already exists for user1
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)

    def test_update_unauthenticated(self):
        self.client.logout()
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_user1_coffee.id})
        data = {'name': 'Cannot Update'}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # === Delete Vendor Tests (DELETE /api/vendors/{id}/) ===

    def test_delete_own_vendor(self):
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_user1_bakery.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Vendor.objects.filter(id=self.vendor_user1_bakery.id).exists())

    def test_delete_fail_system_vendor(self):
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_system_woolworths.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_fail_other_user_vendor(self):
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_user2_restaurant.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_vendor_with_transactions(self):
        """Test that deleting a vendor sets related transactions.vendor to NULL."""
        # Create a transaction with the vendor
        transaction = Transaction.objects.create(
            user=self.user1,
            vendor=self.vendor_user1_coffee,
            transaction_date='2023-01-01',
            description='Coffee purchase',
            original_amount=5.50,
            original_currency='AUD',
            direction='DEBIT',
            source='manual'
        )
        
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_user1_coffee.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        # Verify vendor is deleted
        self.assertFalse(Vendor.objects.filter(id=self.vendor_user1_coffee.id).exists())
        
        # Verify transaction still exists but vendor is set to NULL
        transaction.refresh_from_db()
        self.assertIsNone(transaction.vendor)

    def test_delete_unauthenticated(self):
        self.client.logout()
        url = reverse('vendor-detail', kwargs={'pk': self.vendor_user1_coffee.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED) 