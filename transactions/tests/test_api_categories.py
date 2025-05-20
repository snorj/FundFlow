# transactions/tests/test_api_categories.py
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from ..models import Category

User = get_user_model()

class CategoryAPITests(APITestCase):
    """
    Tests for the Category API endpoints (/api/categories/).
    """

    @classmethod
    def setUpTestData(cls):
        """Set up data for the whole test class."""
        cls.user1 = User.objects.create_user(username='user1', password='password123')
        cls.user2 = User.objects.create_user(username='user2', password='password123')

        cls.cat_system_food = Category.objects.create(name='Food & Beverage', parent=None, user=None)
        cls.cat_system_alcohol = Category.objects.create(name='Alcohol', parent=cls.cat_system_food, user=None)
        cls.cat_system_travel = Category.objects.create(name='Travel', parent=None, user=None)

        cls.cat_user1_holiday = Category.objects.create(name='My Holiday', parent=None, user=cls.user1)
        cls.cat_user1_souvenirs = Category.objects.create(name='Souvenirs', parent=cls.cat_user1_holiday, user=cls.user1)
        cls.cat_user1_hobbies = Category.objects.create(name='Hobbies', parent=None, user=cls.user1)

        cls.cat_user2_work = Category.objects.create(name='Work Expenses', parent=None, user=cls.user2)

        # URLs
        cls.list_create_url = reverse('category-list-create')
        # Detail URL requires a PK, generated dynamically in tests

        # Verification assertion
        expected_count = 7 # 3 system + 3 user1 + 1 user2
        actual_count = Category.objects.count()
        assert actual_count == expected_count, f"Expected {expected_count} categories after setUpTestData, but found {actual_count}"


    def setUp(self):
        """Authenticate user1 for most tests and assign data to self."""
        self.client.force_authenticate(user=self.user1)
        # Assign class data to instance for easier access via self.
        self.user1 = CategoryAPITests.user1
        self.user2 = CategoryAPITests.user2
        self.cat_system_food = CategoryAPITests.cat_system_food
        self.cat_system_alcohol = CategoryAPITests.cat_system_alcohol
        self.cat_system_travel = CategoryAPITests.cat_system_travel
        self.cat_user1_holiday = CategoryAPITests.cat_user1_holiday
        self.cat_user1_souvenirs = CategoryAPITests.cat_user1_souvenirs
        self.cat_user1_hobbies = CategoryAPITests.cat_user1_hobbies
        self.cat_user2_work = CategoryAPITests.cat_user2_work


    # === List Categories Tests (GET /api/categories/) ===

    def test_list_categories_authenticated(self):
        response = self.client.get(self.list_create_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Check based on paginated results
        self.assertIn('results', response.data)
        self.assertEqual(response.data['count'], 6) # 3 system + 3 user1
        results_list = response.data['results']
        self.assertEqual(len(results_list), 6)

        category_names = [cat['name'] for cat in results_list]
        self.assertIn(self.cat_system_food.name, category_names)
        self.assertIn(self.cat_system_alcohol.name, category_names) # Child is also listed
        self.assertIn(self.cat_system_travel.name, category_names)
        self.assertIn(self.cat_user1_holiday.name, category_names)
        self.assertIn(self.cat_user1_souvenirs.name, category_names)
        self.assertIn(self.cat_user1_hobbies.name, category_names)
        self.assertNotIn(self.cat_user2_work.name, category_names) # User 2's excluded

    def test_list_categories_unauthenticated(self):
        self.client.logout()
        response = self.client.get(self.list_create_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # === Create Category Tests (POST /api/categories/) ===

    def test_create_top_level_custom_category(self):
        data = {'name': 'New Custom Top'}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'New Custom Top')
        self.assertIsNone(response.data['parent'])
        self.assertEqual(response.data['user'], self.user1.id)
        self.assertTrue(Category.objects.filter(name='New Custom Top', user=self.user1, parent__isnull=True).exists())

    def test_create_nested_under_system_category(self):
        data = {'name': 'My Groceries', 'parent': self.cat_system_food.id}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'My Groceries')
        self.assertEqual(response.data['parent'], self.cat_system_food.id)
        self.assertEqual(response.data['user'], self.user1.id)

    def test_create_nested_under_own_category(self):
        data = {'name': 'Board Games', 'parent': self.cat_user1_hobbies.id}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Board Games')
        self.assertEqual(response.data['parent'], self.cat_user1_hobbies.id)
        self.assertEqual(response.data['user'], self.user1.id)

    def test_create_fail_nested_under_other_user_category(self):
        data = {'name': 'Should Fail', 'parent': self.cat_user2_work.id}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('parent', response.data)

    def test_create_fail_missing_name(self):
        data = {'parent': self.cat_system_food.id}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)

    def test_create_fail_duplicate_name_same_parent(self):
        data = {'name': 'Souvenirs', 'parent': self.cat_user1_holiday.id}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)
        self.assertTrue(any('already exists' in msg.lower() for msg in response.data['name']))

    def test_create_fail_duplicate_name_top_level(self):
         # Try creating 'Hobbies' again as top-level for user1
        data = {'name': 'Hobbies'}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)
        self.assertTrue(any('already exists' in msg.lower() for msg in response.data['name']))

    def test_create_unauthenticated(self):
        self.client.logout()
        data = {'name': 'Test Unauth'}
        response = self.client.post(self.list_create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # === Retrieve Category Detail Tests (GET /api/categories/{id}/) ===

    def test_retrieve_system_category(self):
        url = reverse('category-detail', kwargs={'pk': self.cat_system_food.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.cat_system_food.name)

    def test_retrieve_own_custom_category(self):
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_holiday.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.cat_user1_holiday.name)
        self.assertEqual(response.data['user'], self.user1.id)

    def test_retrieve_fail_other_user_category(self):
        url = reverse('category-detail', kwargs={'pk': self.cat_user2_work.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_fail_non_existent(self):
        url = reverse('category-detail', kwargs={'pk': 9999})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_unauthenticated(self):
        self.client.logout()
        url = reverse('category-detail', kwargs={'pk': self.cat_system_food.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # === Update Category Tests (PUT/PATCH /api/categories/{id}/) ===

    def test_update_own_custom_category_name(self):
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_hobbies.id})
        data = {'name': 'Updated Hobbies'}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Updated Hobbies')
        self.cat_user1_hobbies.refresh_from_db()
        self.assertEqual(self.cat_user1_hobbies.name, 'Updated Hobbies')

    def test_update_own_custom_category_parent(self):
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_souvenirs.id})
        # Change parent to be top-level (parent=null)
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
        url = reverse('category-detail', kwargs={'pk': self.cat_system_food.id})
        data = {'name': 'Cannot Update This'}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_fail_other_user_category(self):
        url = reverse('category-detail', kwargs={'pk': self.cat_user2_work.id})
        data = {'name': 'Cannot Update This'}
        response = self.client.patch(url, data, format='json')
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_update_fail_invalid_parent(self):
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_hobbies.id})
        data = {'parent': self.cat_user2_work.id}
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('parent', response.data)

    def test_update_fail_duplicate_name_same_parent(self):
        self.cat_user1_hobbies.parent = self.cat_user1_holiday
        self.cat_user1_hobbies.save()
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_hobbies.id})
        data = {'name': 'Souvenirs'} # 'Souvenirs' already exists under 'My Holiday'
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)
        self.assertTrue(any('already exists' in msg.lower() for msg in response.data['name']))

    def test_update_unauthenticated(self):
        self.client.logout()
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_hobbies.id})
        data = {'name': 'Updated Hobbies Unauth'}
        response = self.client.put(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # === Delete Category Tests (DELETE /api/categories/{id}/) ===

    def test_delete_own_custom_category(self):
        cat_to_delete = Category.objects.create(name="To Delete", user=self.user1)
        initial_count = Category.objects.filter(user=self.user1).count()
        url = reverse('category-detail', kwargs={'pk': cat_to_delete.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Category.objects.filter(user=self.user1).count(), initial_count - 1)
        self.assertFalse(Category.objects.filter(pk=cat_to_delete.id).exists())

    def test_delete_fail_system_category(self):
        url = reverse('category-detail', kwargs={'pk': self.cat_system_travel.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_fail_other_user_category(self):
        url = reverse('category-detail', kwargs={'pk': self.cat_user2_work.id})
        response = self.client.delete(url)
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_delete_category_with_children(self):
        """Test deleting a category that has children (children should be promoted)."""
        initial_count = Category.objects.filter(user=self.user1).count() # user1 has 'My Holiday', 'Souvenirs' (child of Holiday), 'Hobbies' = 3
        
        # cat_user1_holiday has cat_user1_souvenirs as a child.
        # Deleting cat_user1_holiday should promote cat_user1_souvenirs.
        holiday_category_id = self.cat_user1_holiday.id
        souvenirs_category_id = self.cat_user1_souvenirs.id

        url = reverse('category-detail', kwargs={'pk': holiday_category_id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        # Check that the parent category is deleted
        self.assertFalse(Category.objects.filter(pk=holiday_category_id).exists())
        
        # Check that the child category still exists and is now top-level
        self.assertTrue(Category.objects.filter(pk=souvenirs_category_id).exists())
        promoted_child = Category.objects.get(pk=souvenirs_category_id)
        self.assertIsNone(promoted_child.parent) # Should now be a top-level category
        self.assertEqual(promoted_child.user, self.user1) # Still belongs to user1

        # User1 started with 3 categories. Deleted 1. Child was promoted, not deleted.
        # So, user1 should now have 2 categories: 'Souvenirs' (promoted) and 'Hobbies'.
        self.assertEqual(Category.objects.filter(user=self.user1).count(), initial_count - 1) 

    def test_delete_unauthenticated(self):
        self.client.logout()
        url = reverse('category-detail', kwargs={'pk': self.cat_user1_hobbies.id})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)