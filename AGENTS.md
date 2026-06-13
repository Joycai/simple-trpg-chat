<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:environment-toolchain-rules -->
# Environment and Shell Toolchain Rules

When running shell commands or setup scripts, ensure you run the appropriate commands based on the detected operating system:
- **Windows (PowerShell)**: Use `setup.ps1` or `setup.bat`. Execute `podman.exe` (typically installed at `~/AppData/Local/Programs/Podman/podman.exe`) or `docker`. Prefix commands with the `&` operator for absolute path execution.
- **macOS / Linux**: Use `setup.sh`. Use native `podman` or `docker` commands directly.
<!-- END:environment-toolchain-rules -->
