# Simple TRPG Chat — Technical Assessment (V1.1)
**Author**: @Shizuku
**Status**: Draft (Updated based on @Anela's feedback)

## 1. Requirement Summary
A lightweight, web-based TRPG tool focusing on chat, dice rolling, and history persistence, with a role-based room management system.

## 2. Refined Technology Stack
Based on team alignment:

- **Framework**: Next.js 14+ (App Router).
- **Language**: TypeScript.
- **Database**: SQLite.
- **ORM**: Drizzle ORM.
- **Authentication**: **NextAuth.js (Auth.js v5)**.
    - *Rationale*: While `iron-session` is lighter, NextAuth v5 has robust App Router support and makes future OAuth integration (Discord/Google) trivial. Credentials provider will be used for Phase 1.
- **Real-time Communication**: **Server-Sent Events (SSE)**.
    - *Rationale*: Native support via Next.js Route Handlers (ReadableStream). Lower complexity than WebSockets while providing superior UX over Polling. 

## 3. Data Model (Refined Schema)
### 3.1. Tables
- **users**: `id, username, password_hash, role (ADMIN/HOST/PLAYER), created_at`
- **rooms**: `id, name, host_id, secret_key, created_at`
- **room_members**: `room_id, user_id, nickname (room-specific), role, joined_at`
- **messages**: `id, room_id, user_id, sender_nickname, content, type (TEXT/DICE), dice_result?, is_private (GM-only), created_at`

## 4. Technical Strategy
### 4.1. SSE Implementation
- Use a dedicated Route Handler (`/api/rooms/[id]/events`) that returns a `Response` with `Content-Type: text/event-stream`.
- Implement a lightweight Event Emitter (in-memory for single-instance, or Redis/KV if scaling is needed later) to broadcast messages.

### 4.2. Dice Rolling
- Server Action handles the roll request, calculates RNG, and persists the message.
- SSE stream broadcasts the result to all room members (or GM-only for private rolls).

## 5. Next Steps
1. Project scaffolding (`npx create-next-app@latest`).
2. Drizzle + SQLite initialization.
3. Auth.js v5 configuration.
