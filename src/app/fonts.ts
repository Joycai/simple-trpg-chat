/**
 * Theme typography — self-hosted web fonts via next/font/google.
 *
 * Each font exposes a CSS variable (`variable`) that is referenced from the
 * per-theme `--theme-font*` declarations in src/themes/<id>/theme.css.
 * The variable classes are attached to <html> in layout.tsx, so the active
 * `data-theme` simply picks which family resolves.
 *
 * Only the default theme's fonts (Inter + JetBrains Mono) are preloaded; the
 * concept fonts use `preload: false` so they download on demand when their
 * theme is active, keeping the initial payload light.
 */
import {
  Inter,
  Space_Grotesk,
  JetBrains_Mono,
  Crimson_Text,
  Cinzel,
  Cormorant_Garamond,
  Shippori_Mincho,
  Courier_Prime,
  Marcellus,
} from "next/font/google";

// --- Default (modern web) ---
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  preload: false,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

// --- Aged Parchment (western fantasy) ---
const crimsonText = Crimson_Text({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-crimson",
  display: "swap",
  preload: false,
});

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
  preload: false,
});

const courierPrime = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-courier-prime",
  display: "swap",
  preload: false,
});

// --- Call of Cthulhu (cosmic / gothic horror) ---
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
});

// --- Ancient Shrine (Japanese mincho) ---
const shippori = Shippori_Mincho({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  variable: "--font-shippori",
  display: "swap",
  preload: false,
});

// --- Azure Aether (skybound fantasy — elegant JRPG-menu serif) ---
const marcellus = Marcellus({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-marcellus",
  display: "swap",
  preload: false,
});

/** Space-separated variable class list to spread onto <html>. */
export const fontVariables = [
  inter.variable,
  spaceGrotesk.variable,
  jetbrainsMono.variable,
  crimsonText.variable,
  cinzel.variable,
  courierPrime.variable,
  cormorant.variable,
  shippori.variable,
  marcellus.variable,
].join(" ");
