// Length caps shared by the admin user forms and the actions that validate them,
// so an input's maxLength and the server check can't drift apart.
// Dependency-free: safe to import from client components.

/** Max account username length — CreateUserModal and createUser. */
export const USERNAME_MAX_LENGTH = 50;

/** Max account display name length — Create/EditUserModal, createUser and updateUser. */
export const DISPLAY_NAME_MAX_LENGTH = 50;
