# Simple TRPG Chat — AI Capability Assessment (V1.0)
**Author**: @Shizuku
**Status**: Draft

## 1. Overview
Requirement: Integrate AI capabilities with an admin toggle and host-specific configurations (OpenAI-compatible).

## 2. Technical Architecture
### 2.1. Global Activation (Admin)
- **Mechanism**: A new `system_settings` table to store global feature flags.
- **Toggle**: `ai_feature_enabled` (boolean).

### 2.2. Host Configuration (GM)
- **Storage**: A dedicated `user_ai_settings` table linked to user IDs.
- **Fields**:
    - `baseUrl`: Custom API endpoint (supports proxies like Groq, DeepSeek, etc.).
    - `apiKey`: Stored server-side.
    - `model`: Model identifier (e.g., `gpt-4o`, `deepseek-chat`).

### 2.3. AI Service Implementation
- **Standard**: Follow OpenAI API specification for compatibility.
- **Proxy**: Next.js Server Actions/Route Handlers will proxy requests to keep keys secure.

## 3. Proposed Schema Updates
- **Table**: `system_settings`
- **Table**: `user_ai_settings` (FK to `users.id`)

## 4. Potential Use Cases
- **Smart Clue Management**: Extracting key items/NPCs from chat logs.
- **Automated Summary**: Generating "The Story So Far" for long campaigns.
- **Bot Narrator**: Assisted room descriptions.

## 5. Next Steps
1. Boss sign-off on AI Assessment.
2. S9: Schema implementation.
3. S10: Admin UI & Host Config UI.
