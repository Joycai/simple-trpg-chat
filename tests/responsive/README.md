# Responsive regression tests

Run `pnpm test:responsive`. First install browsers with
`pnpm exec playwright install chromium webkit` (`--with-deps` on Linux).

The dedicated Vite fixture renders the real room components and global/theme CSS.
Only Next's Link boundary and server actions are replaced; no PostgreSQL, account,
or writes to real rooms are needed. This suite runs in CI separately from the
authenticated application E2E tests.

Chromium and WebKit cover 320px phones, phone portrait/landscape, iPad
portrait/landscape, and the 1024px iPad Pro breakpoint. Tests assert usable input
width and sending, menu bounds after rotation and selection/dismissal, expanded
editor save and footer access, scrollable short-screen dialogs, touch-visible
category editing/withdrawal, sidebar breakpoint behavior, and pointer dragging.
Chromium additionally tests trusted touch drag/cancellation using CDP.

These are component integration tests, not full application E2E or physical iOS
device tests. Real soft-keyboard behavior and device safe areas still need device
QA; rotating/resizing a browser viewport does not emulate an OS keyboard.
