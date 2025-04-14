from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework.validators import UniqueValidator
from django.core.exceptions import ValidationError as DjangoValidationError # Import Django's ValidationError

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for user information returned after authentication
    """
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name')
        read_only_fields = ('id',)


class RegisterSerializer(serializers.ModelSerializer):
    """
    Serializer for user registration with password confirmation
    """
    email = serializers.EmailField(
        required=True,
        validators=[UniqueValidator(queryset=User.objects.all(), message="A user with that email already exists.")],
        # Ensure emails are unique
    )

    password = serializers.CharField(
        write_only=True, required=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, required=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'password2',
                  'first_name', 'last_name')
        extra_kwargs = {
            'first_name': {'required': True},
            'last_name': {'required': True},
        }

    def validate(self, attrs):
        # Check if passwords match
        if attrs['password'] != attrs['password2']:
            # Raise a ValidationError that is specific to the passwords
            # Assigning to a key like 'password' or 'non_field_errors'
            # depends on how you want the error to appear.
            # Let's keep it under 'password' for now based on test expectations
            raise serializers.ValidationError({"password": "Password fields didn't match."})

        # Check for existing email using the validator (already handled by field validator)
        # Check for existing username (usually handled by Model field unique constraint)

        return attrs

    def create(self, validated_data):
        # Remove password2 as it's not needed for User creation
        validated_data.pop('password2')

        # Validate password strength before creating
        # Handled by the validator on the password field in the serializer

        # Create user with provided data
        user = User.objects.create(
            username=validated_data['username'],
            email=validated_data['email'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', '')
        )

        # Set password (handles hashing)
        user.set_password(validated_data['password'])
        user.save()

        return user