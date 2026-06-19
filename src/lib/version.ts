// Named import so the bundler keeps only `version`, not the whole manifest.
import { version } from "../../package.json";

/** App version, sourced from package.json. Import in server components only. */
export const APP_VERSION: string = version;
