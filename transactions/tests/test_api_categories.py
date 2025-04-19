from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from ..models import Category # Use relative import from parent directory

User = get_user_model()

class CategoryAPITests(APITestCase):
    """
    Tests for the Category API endpoints (/api/categories/).
    """

    @classmethod
    def setUpTestData(cls):
        """Set up data for the whole test class."""
        # User 1 (will be authenticated in most tests)
        cls.user1 = User.objects.create_user(username='user1', password='password123')
        # User 2 (to test permissions)
        cls.user2 = User.objects.create_user(username='user2', password='password123')

        # System Categories (user=None)
        cls.cat_system_food = Category.objects.create(name='Food & Beverage', parent=None, user=None)
        cls.cat_system_alcohol = Category.objects.create(name='Alcohol', parent=cls.cat_system_food, user=None)
        cls.cat_system_travel = Category.objects.create(name='Travel', parent=None, user=None)

        # User 1's Custom Categories
        cls.cat_user1_holiday = Category.objects.create(name='My Holiday', parent=None, user=cls.user1)
        cls.cat_user1_souvenirs = Category.objects.create(name='Souvenirs', parent=cls.cat_user1_holiday, user=cls.user1)
        cls.cat_user1_hobbies = Category.objects.create(name='Hobbies', parent=None, user=cls.user1)


        # User 2's Custom Category (should not be visible/modifiable by user1)
        cls.cat_user2_work = Category.objects.create(name='Work Expenses', parent=None, user=cls.user2)

        # --- ADD ASSERTION HERE ---
        expected_count = 7 # 3 system + 3 user1 + 1 user2
        actual_count = Category.objects.count()
        assert actual_count == expected_count, f"Expected {expected_count} categories after setUpTestData, but found {actual_count}"
        # --- END ASSERTION ---

        # URLs
        cls.list_create_url = reverse('category-list-create') # Name from transactions/urls.py
        # Detail URL requires a PK, generated dynamically in tests

    def setUp(self):
        """Authenticate user1 for most tests."""
        self.client.force_authenticate(user=self.user1)
        # Note: force_authenticate bypasses actual token login, useful for testing permissions directly

    # === List Categories Tests (GET /api/categories/) ===

    def test_list_categories_authenticated(self):
        """
        Ensure authenticated user sees system categories and their own custom categories.
        """
        response = self.client.get(self.list_create_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # --- Check Pagination Structure ---
        self.assertIn('count', response.data)
        self.assertIn('results', response.data)
        self.assertEqual(response.data['count'], 6) # Check the total count reported by pagination
        # --- End Pagination Check ---

        # --- Corrected Assertion ---
        # Assert based on the 'results' list
        results_list = response.data['results']
        self.assertEqual(len(results_list), 6)
        # --- End Correction ---

        # Verify presence of specific expected category names within the results
        category_names = [cat['name'] for cat in results_list]
        self.assertIn(self.cat_system_food.name, category_names)
        self.assertIn(self.cat_system_travel.name, category_names)
        self.assertIn(self.cat_user1_holiday.name, category_names)
        self.assertIn(self.cat_user1_souvenirs.name, category_names)

        # Verify user2's category is NOT present
        self.assertNotIn(self.cat_user2_work.name, category_names)

    def test_list_categories_unauthenticated(self):
        """
        Ensure unauthenticated users cannot list categories.
        """
        self.client.logout() # Ensure not authenticated
        response = self.client.get(self.list_create_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN) # IsAuthenticated permission

    # === Create Category Tests (POST /api/categories/) ===

    def test_create_top_level_custom_category(self):
        """
        Ensure user can create a new top-level custom category.
        """
        data = {'name': 'New Custom Top'}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'New Custom Top')
        self.assertIsNone(response.data['parent']) # No parent ID
        self.assertEqual(response.data['user'], self.user1.id) # Associated with user1
        self.assertTrue(Category.objects.filter(name='New Custom Top', user=self.user1).exists())

    def test_create_nested_under_system_category(self):
        """
        Ensure user can create a custom category nested under a system category.
        """
        data = {'name': 'My Groceries', 'parent': self.cat_system_food.id}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'My Groceries')
        self.assertEqual(response.data['parent'], self.cat_system_food.id) # Check parent ID
        self.assertEqual(response.data['user'], self.user1.id)

    def test_create_nested_under_own_category(self):
        """
        Ensure user can create a custom category nested under their own category.
        """
        data = {'name': 'Board Games', 'parent': self.cat_user1_hobbies.id}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Board Games')
        self.assertEqual(response.data['parent'], self.cat_user1_hobbies.id)
        self.assertEqual(response.data['user'], self.user1.id)

    def test_create_fail_nested_under_other_user_category(self):
        """
        Ensure user cannot create a category nested under another user's category.
        """
        data = {'name': 'Should Fail', 'parent': self.cat_user2_work.id}
        response = self.client.post(self.list_create_url, data, format='json')
        # Expecting validation error from serializer's validate_parent
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('parent', response.data) # Error should be related to parent field

    def test_create_fail_missing_name(self):
        """
        Ensure creating a category fails if name is missing.
        """
        data = {'parent': self.cat_system_food.id} # Missing 'name'
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)

    def test_create_fail_duplicate_name_same_parent(self):
        """
        Ensure creating a category fails if name is duplicate under same parent/user.
        """
        # Try creating 'Souvenirs' under 'My Holiday' again for user1
        data = {'name': 'Souvenirs', 'parent': self.cat_user1_holiday.id}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data) # Error should be on name field due to validation

    def test_create_unauthenticated(self):
        """
        Ensure unauthenticated users cannot create categories.
        """
        self.client.logout()
        data = {'name': 'Test Unauth'}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # === Retrieve Category Detail Tests (GET /api/categories/{id}/) ===

    def test_retrieve_system_category(self):
        """Ensure user can retrieve a system category."""
        url = reverse('category-detail', kwargs={'pk': self.cat_system_food.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.cat_system_food.name)

    def test_retrieve_own_custom_category(self):
        """Ensure user can retrieve their own custom category."""
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_holiday.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.cat_user1_holiday.name)
        self.assertEqual(response.data['user'], self.user1.id)

    def test_retrieve_fail_other_user_category(self):
        """Ensure user cannot retrieve another user's custom category (queryset filter)."""
        url = reverse('category-detail', kwargs={'pk': self.cat_user2_work.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_fail_non_existent(self):
        """Ensure retrieving a non-existent category fails."""
        url = reverse('category-detail', kwargs={'pk': 9999}) # Assume 9999 doesn't exist
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_unauthenticated(self):
        """Ensure unauthenticated user cannot retrieve category detail."""
        self.client.logout()
        url = reverse('category-detail', kwargs={'pk': self.cat_system_food.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


    # === Update Category Tests (PUT/PATCH /api/categories/{id}/) ===

    def test_update_own_custom_category_name(self):
        """Ensure user can update their own custom category's name."""
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_hobbies.id})
        data = {'name': 'Updated Hobbies'} # Only sending name for PATCH
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Updated Hobbies')
        # Verify change in DB
        self.cat_user1_hobbies.refresh_from_db()
        self.assertEqual(self.cat_user1_hobbies.name, 'Updated Hobbies')

    def test_update_own_custom_category_parent(self):
        """Ensure user can change the parent of their own custom category."""
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_souvenirs.id})
        # Change parent from 'My Holiday' to be top-level (parent=null)
        data = {'parent': None}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data['parent'])
        # Change parent to a system category
        data = {'parent': self.cat_system_travel.id}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['parent'], self.cat_system_travel.id)

    def test_update_fail_system_category(self):
        """Ensure user cannot update a system category."""
        url = reverse('category-detail', kwargs={'pk': self.cat_system_food.id})
        data = {'name': 'Cannot Update This'}
        response = self.client.patch(url, data, format='json')
        # IsOwnerOrSystemReadOnly permission should block this
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_fail_other_user_category(self):
        """Ensure user cannot update another user's custom category."""
        url = reverse('category-detail', kwargs={'pk': self.cat_user2_work.id})
        data = {'name': 'Cannot Update This'}
        response = self.client.patch(url, data, format='json')
        # Should be blocked by either queryset (404) or permission (403)
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_update_fail_invalid_parent(self):
        """Ensure user cannot set parent to another user's category."""
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_hobbies.id})
        data = {'parent': self.cat_user2_work.id} # Invalid parent
        response = self.client.patch(url, data, format='json')
        # Expecting validation error from serializer's validate_parent
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('parent', response.data)

    def test_update_fail_duplicate_name_same_parent(self):
        """Ensure user cannot update name to create a duplicate."""
        # Make 'Hobbies' a child of 'My Holiday' first
        self.cat_user1_hobbies.parent = self.cat_user1_holiday
        self.cat_user1_hobbies.save()
        # Now try to rename 'Hobbies' to 'Souvenirs' (which already exists under 'My Holiday')
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_hobbies.id})
        data = {'name': 'Souvenirs'}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data) # Validation error on name

    def test_update_unauthenticated(self):
        """Ensure unauthenticated user cannot update."""
        self.client.logout()
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_hobbies.id})
        data = {'name': 'Test Unauth'}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


    # === Delete Category Tests (DELETE /api/categories/{id}/) ===

    def test_delete_own_custom_category(self):
        """Ensure user can delete their own custom category."""
        cat_to_delete = Category.objects.create(name="To Delete", user=self.user1)
        initial_count = Category.objects.filter(user=self.user1).count()
        url = reverse('category-detail', kwargs={'pk': cat_to_delete.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        # Verify it's gone from DB
        self.assertEqual(Category.objects.filter(user=self.user1).count(), initial_count - 1)
        self.assertFalse(Category.objects.filter(pk=cat_to_delete.id).exists())

    def test_delete_fail_system_category(self):
        """Ensure user cannot delete a system category."""
        url = reverse('category-detail', kwargs={'pk': self.cat_system_travel.id})
        response = self.client.delete(url)
        # IsOwnerOrSystemReadOnly permission should block this
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_fail_other_user_category(self):
        """Ensure user cannot delete another user's custom category."""
        url = reverse('category-detail', kwargs={'pk': self.cat_user2_work.id})
        response = self.client.delete(url)
        # Should be blocked by either queryset (404) or permission (403)
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_delete_category_with_children(self):
        """Test deleting a category that has children (CASCADE behavior)."""
        initial_count = Category.objects.filter(user=self.user1).count() # Holiday + Souvenirs + Hobbies
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_holiday.id}) # Delete 'My Holiday'
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        # Verify parent AND child ('Souvenirs') are gone due to CASCADE
        self.assertEqual(Category.objects.filter(user=self.user1).count(), initial_count - 2)
        self.assertFalse(Category.objects.filter(pk=self.cat_user1_holiday.id).exists())
        self.assertFalse(Category.objects.filter(pk=self.cat_user1_souvenirs.id).exists())
        # Verify 'Hobbies' still exists
        self.assertTrue(Category.objects.filter(pk=self.cat_user1_hobbies.id).exists())


    def test_delete_unauthenticated(self):
        """Ensure unauthenticated user cannot delete."""
        self.client.logout()
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_hobbies.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)