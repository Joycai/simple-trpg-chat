# Simple TRPG Chat — AI Bot (Agent) Capability Assessment (V1.1)
**Author**: @Shizuku
**Status**: Draft

## 1. Overview
The goal is to introduce LLM-driven Bots (Agents) that can participate in TRPG rooms as active members. These bots will support role-playing via System Prompts, utilize "Tool Calling" for game actions (dice rolls, messaging), and possess "Game Memory" (knowledge of received clues and items).

## 2. Core Architecture: "Bot-as-User"
To maintain system consistency, each Bot will be associated with a standard `userId`. This allows the Bot to:
- Send messages and roll dice using existing actions.
- Receive items/clues via the `inventory_distributions` table.
- Be isolated per room with specific role-play settings.

## 3. Technical Components

### 3.1. Database Extension (Schema)
New table `room_bots`:
- `id` (PK)
- `roomId` (FK to rooms)
- `userId` (FK to users): Dedicated shadow user for the bot.
- `sysPrompt` (text): The "Soul" of the bot (Role, Personality, Secret Knowledge).
- `configJson` (text): LLM parameters (Model, Temperature) and activation rules (e.g., respond to @bot).

### 3.2. Memory Management System
The context provided to the LLM will be dynamically constructed from three sources:
1. **Static Memory**: The `sysPrompt` defined by the Host.
2. **Knowledge Base**: All `inventory_items` currently distributed to the Bot's `userId`.
3. **Short-term Memory**: Recent chat history from the `messages` table.
   - *Note: For long campaigns, we will implement "Progressive Disclosure" via a rolling window or a summarization trigger.*

### 3.3. Tool Calling Integration
We will expose a set of "Game Tools" to the LLM using the OpenAI function-calling standard:
- `roll_dice(faces, count)`: Invokes `rollDiceAction`.
- `send_message(content, isPrivate)`: Invokes `sendMessageAction`.
- `search_clues()`: Lists items in the bot's inventory.

### 3.4. Activation Logic
- **Passive**: Responds only when @mentioned.
- **Active (Narrator mode)**: Reacts to specific keywords or game events (e.g., a critical failure).

## 4. Implementation Plan
1. **Phase 1 (Infrastructure)**: Schema update for `room_bots` and "Bot User" creation logic.
2. **Phase 2 (Orchestration)**: Build the `AgentRunner` logic to fetch context, call LLM, and handle tool outputs.
3. **Phase 3 (UI)**: Host-facing Bot Management panel (Creation, SysPrompt editor).

## 5. Security & Cost
- **Admin Control**: AI Bots will only be available if the global `ai_feature_enabled` flag is ON.
- **Quota Management**: Implement token limits per room/user to prevent runaway costs.
