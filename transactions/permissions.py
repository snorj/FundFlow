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

class IsOwner(permissions.BasePermission):
    """
    Custom permission to only allow owners of an object to edit or delete it.
    Assumes the object has a 'user' attribute.
    """

    def has_object_permission(self, request, view, obj):
        # Write permissions are only allowed to the owner of the transaction.
        # SAFE_METHODS (GET, HEAD, OPTIONS) are implicitly allowed if this permission
        # is used in conjunction with IsAuthenticated, but for an Update/Destroy view,
        # we are primarily concerned with non-safe methods.
        if hasattr(obj, 'user'): # Check if the object has a user attribute
            return obj.user == request.user
        # If the object does not have a user attribute, deny permission by default
        # This could also raise an error or log a warning if a user attribute is always expected.
        return False