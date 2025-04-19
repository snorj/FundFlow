from rest_framework import permissions

class IsOwnerOrSystemReadOnly(permissions.BasePermission):
    """
    Custom permission:
    - Allows read access (GET, HEAD, OPTIONS) to any category object
      (assuming the view's queryset already filters based on user/system).
    - Allows write access (PUT, PATCH, DELETE) only if the category
      is custom (user is not None) AND owned by the request user.
    """

    def has_object_permission(self, request, view, obj):
        # Read permissions are allowed for any request,
        # so we'll always allow GET, HEAD or OPTIONS requests.
        if request.method in permissions.SAFE_METHODS:
            return True

        # Write permissions are only allowed if the category is custom
        # AND owned by the current user.
        # System categories (obj.user is None) cannot be modified.
        return obj.user is not None and obj.user == request.user