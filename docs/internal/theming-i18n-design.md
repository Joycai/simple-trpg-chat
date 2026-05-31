# System Design: Theming & i18n Expansion (Simple TRPG Chat)

## 1. Theming Abstraction Architecture

To support dynamic theme switching per room, we will decouple hardcoded colors from UI components using CSS Variables (Custom Properties) and Tailwind CSS configuration.

### 1.1 CSS Variables Strategy
Instead of using fixed Tailwind classes like `bg-zinc-900` or `text-indigo-400`, we will map logical design tokens to CSS variables defined at the root or room-container level.

**Logical Tokens (Examples):**
*   `--bg-primary`: Main background color.
*   `--bg-secondary`: Sidebar, cards, modal background.
*   `--text-primary`: Standard reading text.
*   `--text-muted`: Metadata, timestamps, placeholders.
*   `--accent-primary`: Primary buttons, highlights, Host tags.
*   `--accent-dice`: Specific color for dice roll cards and results.
*   `--border-color`: Dividers, borders.

### 1.2 Room Theme Configuration
*   **Database Update**: Add a `theme` column to the `rooms` table.
    *   `theme` (String) - Enum values: `'default'`, `'parchment'`, `'cthulhu'`, `'shrine'`. Default is `'default'` (the current dark Tabletop theme).
*   **Host Settings**: The room creation/settings modal will include a "Theme Selection" dropdown.
*   **Implementation**: The room page (`/rooms/[id]`) will apply a specific CSS class (e.g., `theme-parchment`) to the main wrapper, which overrides the CSS variables for the children components.

---

## 2. Visual Design Specs

### 2.1 Theme 1: "Old Parchment" (古旧羊皮卷)
**Vibe**: Classic fantasy, D&D, historical, tactile, analog.
*   **Colors**:
    *   `--bg-primary`: `#FDF6E3` (Aged paper, off-white/beige)
    *   `--bg-secondary`: `#F4E8D1` (Slightly darker parchment for panels)
    *   `--text-primary`: `#2C241B` (Dark sepia/brown ink)
    *   `--text-muted`: `#786854` (Faded ink)
    *   `--accent-primary`: `#8B0000` (Wax seal red or deep crimson)
    *   `--accent-dice`: `#1A4B2C` (Deep forest green or polished brass)
    *   `--border-color`: `#D3C3A8` (Darker paper edge)
*   **Typography**:
    *   UI: Standard sans-serif for readability (e.g., Inter), but potentially a serif font (e.g., Merriweather or Crimson Pro) for message content to feel more "written".
*   **Styling Accents**:
    *   Soft drop shadows, slightly rounded corners (less modern, more organic).
    *   Borders could have a slight texture or double-line style.

### 2.2 Theme 2: "Mysterious Cthulhu" (神秘恐怖克苏鲁)
**Vibe**: Cosmic horror, Lovecraftian, unsettling, deep ocean, glowing runes.
*   **Colors**:
    *   `--bg-primary`: `#0D1117` (Deep, abyssal black-green)
    *   `--bg-secondary`: `#161B22` (Slightly lighter dark slate)
    *   `--text-primary`: `#C9D1D9` (Pale, ghostly white)
    *   `--text-muted`: `#8B949E` (Murky gray)
    *   `--accent-primary`: `#00FF9D` (Unsettling neon green / eldritch glow)
    *   `--accent-dice`: `#9D00FF` (Otherworldly purple)
    *   `--border-color`: `#30363D` (Dark slate)
*   **Typography**:
    *   Monospaced fonts (e.g., Fira Code or JetBrains Mono) mixed with standard sans-serif to give an "investigative report" or "terminal" feel.
*   **Styling Accents**:
    *   Harsh borders, glow effects (`box-shadow: 0 0 10px var(--accent-primary)`) on hover or critical rolls.
    *   Dice roll cards might have a subtle static/glitch background noise or a creeping gradient.

### 2.3 Theme 3: "Ancient Shrine" (远古神社 / 和风古木)
**Vibe**: Traditional Japanese, serene, spiritual, ancient wood, vermilion accents.
*   **Colors**:
    *   `--bg-primary`: `#2D241E` (Dark aged wood / Kuwazome)
    *   `--bg-secondary`: `#1F1813` (Deeper wood tone)
    *   `--text-primary`: `#E8D5C4` (Warm paper/sand color)
    *   `--text-muted`: `#9E8A78` (Faded wood)
    *   `--accent-primary`: `#C93A24` (Vermilion / Torii red)
    *   `--accent-dice`: `#D4AF37` (Pale gold / Shrine amulet)
    *   `--border-color`: `#4A3C31` (Wood grain edge)
*   **Typography**:
    *   UI: Elegant sans-serif or traditional Mincho (serif) font to emulate Japanese calligraphy styles.
*   **Styling Accents**:
    *   Subtle paper texture (和纸) or wood grain patterns for background if possible.
    *   Borders might feature subtle decorative corners reminiscent of traditional Japanese architecture.

---

## 3. i18n (Internationalization) Strategy

We will use a robust i18n library compatible with Next.js App Router (e.g., `next-intl` or `react-i18next`).

### 3.1 Localization Structure (JSON)
Translations will be split by namespaces/features to keep files manageable.

**Example Structure (`/messages/en.json` & `/messages/zh.json`):**

```json
{
  "auth": {
    "login_title": "Simple TRPG Chat",
    "username": "Username",
    "password": "Password",
    "login_button": "Log In",
    "logging_in": "Logging in...",
    "error_credentials": "Username or password incorrect. Please try again."
  },
  "lobby": {
    "title": "Room Lobby",
    "create_room": "Create Room",
    "join_room": "Join",
    "room_name": "Room Name",
    "host": "Host"
  },
  "room": {
    "online_members": "Online Members",
    "message_placeholder": "Type your message...",
    "dice_tray": "Dice Tray",
    "private_roll": "Private Roll",
    "roll_button": "Roll",
    "system_joined": "{name} joined the room.",
    "system_private_roll_hidden": "{name} made a private roll.",
    "theme_default": "Default Dark",
    "theme_parchment": "Old Parchment",
    "theme_cthulhu": "Cosmic Horror"
  }
}
```

### 3.2 Implementation Steps
1.  Setup i18n routing middleware to detect user locale preference.
2.  Wrap the application with the translation provider.
3.  Replace all hardcoded strings in components with `t('namespace.key')` function calls.

---
**Status**: Theme & i18n Design Draft for Team Review (@Anela, @Shizuku).