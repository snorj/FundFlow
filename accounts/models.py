from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    """
    Custom User model that extends Django's AbstractUser.
    
    This gives us flexibility to add custom fields and methods to the User model 
    in the future without having to migrate to a custom model later.
    """
    # You can add custom fields here, for example:
    # phone_number = models.CharField(max_length=15, blank=True, null=True)
    # date_of_birth = models.DateField(blank=True, null=True)
    
    # Even if you don't need custom fields now, having a custom User model
    # from the beginning is considered best practice for Django projects.
    
    def __str__(self):
        """String representation of the user."""
        return self.email if self.email else self.username