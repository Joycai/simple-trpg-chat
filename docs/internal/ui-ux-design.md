# UI/UX Design Specification: Simple TRPG Chat (B2)

## 1. Design Language & Theme
- **Theme**: Dark mode default (`slate` or `zinc` palette from Tailwind). Gives a focused, late-night tabletop gaming vibe.
- **Typography**: Clean sans-serif for UI (Inter/Geist), monospaced for roll formulas and system messages.
- **Accent Color**: Primary color (e.g., Violet/Indigo) for user actions, secondary (Amber/Orange) for dice rolls to make them pop.

## 2. Page Flow

### 2.1 Login / Landing Page (`/login`)
- **Layout**: Centered card.
- **Components**:
  - Logo/Title: "Simple TRPG Chat".
  - Inputs: Username, Password.
  - Action: Login button.
- **UX**: Redirects to Lobby (`/`) upon success. Admin redirect to `/admin`.

### 2.2 Lobby (`/`)
- **Layout**: Top navigation bar + Main content grid.
- **Components**:
  - **Header**: User `display_name`, Logout button.
  - **Room List**: Grid of active rooms.
    - Room Card: Room name, Host name, "Join" button.
    - **Join Modal**: Prompts for `Room Password` and `Session Nickname` (defaults to `display_name`).
  - **Host Actions**: If `role === 'host'`, a "Create Room" button is visible (prompts for Name & Password).

### 2.3 Room Interface (`/room/[id]`)
- **Layout**: 3-Pane Layout.
  1. **Sidebar (Left/Drawer on Mobile)**: Online members, Room Name, Host actions.
  2. **Main (Center)**: Chat History.
  3. **Bottom Area**: Input + Dice Tray.

## 3. Room Component Breakdown

### 3.1 Sidebar (Participants)
- **Host Tag**: A crown icon or distinct color for the Host.
- **Member Item**: Displays `Nickname`.
- **Status Indicator**: Green dot for connected (via SSE presence heartbeat).

### 3.2 Main Message Area
- **Scroll Behavior**: Anchored to bottom. Auto-scrolls on new messages.
- **Message Types**:
  - **Normal Text**: 
    - Header: `<Nickname> [Time]`
    - Body: Plain text, slightly muted white (`text-zinc-200`).
  - **System Message**: Centered, muted text (e.g., "*Alice joined the room*").
  - **Dice Roll Card**: 
    - Distinct background (e.g., `bg-indigo-950/30`).
    - Header: `<Nickname> 掷骰 [Time]`
    - Formula: `3d6 + 2`
    - Result Details: `[4, 2, 6] + 2`
    - Final Sum: Large, bold number (e.g., **14**).
  - **Private Roll (暗骰)**:
    - If viewed by Host/Sender: Same as above, but with a `[暗骰 - 仅主持人可见]` tag and a striped/dashed border.
    - If viewed by other Players: Shows "*[Nickname] 进行了一次暗骰*" (Results hidden).

### 3.3 Input & Dice Tray (Bottom)
- **Input Bar**:
  - Nickname Toggle: Small button inside the input field to quickly change `room_members.nickname`.
  - Textarea: Auto-expanding, enter to send.
  - "Dice Tray" Toggle Button: Opens the dice panel.
- **Dice Tray (Slide-up Panel / Popover)**:
  - **Dice Buttons**: `d4`, `d6`, `d8`, `d10`, `d12`, `d20`, `d100`.
  - **Quantity Selector**: Numeric input or +/- buttons (Default: 1).
  - **Modifier Input**: Optional +/- integer (e.g., +2).
  - **Host Exclusive Option**: A "Private Roll (暗骰)" checkbox, only visible if `role === 'host'`.
  - **Action**: "Roll" button.

## 4. Mobile Responsiveness
- Sidebar collapses into a hamburger menu.
- Dice Tray changes from a popover to a bottom-sheet (BottomSheet).
- Chat area takes full height.

---
**Status**: Ready for Implementation (nagisa & Shizuku).