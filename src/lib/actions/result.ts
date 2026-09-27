/**
 * The result shape every write action returns (see CLAUDE.md → Error
 * handling): `{ success: true, ...data }` or `{ success: false, error }`, with
 * `error` already localized on the server. Type-only and dependency-free, so
 * client code (`useAsyncAction`) can name it too.
 */
export type Fail = { success: false; error: string };

/** A write that returns nothing beyond success. */
export type Done = { success: true } | Fail;
