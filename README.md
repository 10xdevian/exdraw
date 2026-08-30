# Excaldraw (Collaborative Whiteboarding App) 🎨

Welcome to the **Excaldraw** monorepo! This project is a highly scalable, real-time collaborative whiteboarding and drawing application. It is designed with performance, real-time synchronization, and local-first rendering in mind.

---

## 🏗️ Monorepo Architecture

This project utilizes **Turborepo** to manage a fast, strictly-bounded, and scalable monorepo structure. It is split into strictly decoupled `apps` and `packages`.

### 📂 Apps
- **`apps/exceldraw-frontend`**: The user-facing Next.js 15 web application.
- **`apps/http-backend`**: An Express.js REST API server handling authentication, persistent storage, and metadata.
- **`apps/ws-backend`**: A dedicated WebSocket server handling high-frequency, low-latency live collaborations.

### 📦 Packages
- **`packages/db`**: Prisma ORM configuration and generated database client connecting to PostgreSQL.
- **`packages/shared`**: Shared TypeScript definitions, constants (like `BACKEND_URL`), and Zod schemas used across both backend and frontend.
- **`packages/ui`**: Shared UI components.
- **`packages/eslint-config` & `packages/typescript-config`**: Shared strict configurations.

---

## 💻 Frontend Architecture (`exceldraw-frontend`)

The frontend is built on **Next.js 15 (App Router)** heavily optimized for performance, utilizing a strict State Management philosophy to prevent unnecessary React re-renders.

### The 6 Pillars of State Management
We classify and manage state across 6 distinct architectural domains:

1. **Global Client State (Zustand)**
   - Used for application-wide interaction states (e.g., `isAuthOpen`, `isViewerPromptOpen`).
   - Housed in `store/uiStore.ts`. We use strict atomic selectors (e.g., `const isOpen = useUIStore(s => s.isOpen)`) to prevent widespread re-renders.

2. **Server State (TanStack Query)**
   - Handles all API interactions, caching, background refetching, and deduping.
   - We utilize targeted mutations (`useMutation`) and precise cache invalidation (via `queryClient.invalidateQueries`) to keep the UI snappy without full-page reloads.

3. **Form State (React Hook Form + Zod)**
   - All forms (Authentication, Guest Join) are managed outside of normal React state using `react-hook-form` to prevent keystroke re-renders.
   - Validation is strictly enforced at the boundary using `Zod` schemas.

4. **URL State (Next.js `useSearchParams`)**
   - Shareable configurations, such as view-only mode (`?mode=view`), are tied directly to the URL. The URL is the single source of truth for these parameters.

5. **Local UI State (React `useState`)**
   - Kept strictly for isolated, component-level toggles (e.g., dropdowns, selected tools in the toolbar) where global access is unnecessary.

6. **High-Frequency Canvas State (Vanilla JS Engine)**
   - **Crucial Optimization:** React is *not* used to render the live drawing operations (like mouse movements, pointer coordinates, and active strokes).
   - Drawing state is handled by a specialized Vanilla JS Engine (`DrawCanva`) that directly manipulates the HTML5 `<canvas>` element. This prevents React from devastating the frame rate at 120Hz.

### Styling
- **Tailwind CSS v4** & **Shadcn UI** (Radix UI primitives) for accessible, rapid UI development.

---

## ⚙️ Backend Architecture

### REST API (`http-backend`)
An Express.js server that acts as the persistent authority.
- **Auth Flow**: JWT-based authentication for `signin` and `signup`.
- **Rooms**: Creates unique URL slugs for rooms.
- **Syncing**: Handles bulk syncing of local drawings (`POST /room/:slug/sync`) when users decide to share their private canvas.
- **Viewers**: Tracks and fetches active guests/viewers (`GET /room/:slug/viewers`).

### WebSocket Server (`ws-backend`)
A lightweight, purely event-driven WebSocket server.
- Handles `join_room` events.
- Broadcasts high-frequency pointer movements, shape additions, and drawing operations in real-time to all connected peers in a specific room.

---

## 🗄️ Database Schema (`packages/db`)

We use **Prisma** paired with **PostgreSQL**. The core models include:
- **`User`**: Registered users (id, username, email, password).
- **`Room`**: Collaborative whiteboard sessions tied to an admin (`adminId`) and a unique `slug`.
- **`Chat`**: Represents the individual shapes/messages drawn in the room.
- **`Viewer`**: Represents the registered view-only guests who have accessed a room.

---

## 🔄 Core Workflows & Data Flow

### 1. The Local-First Experience
Users can land on the application and immediately start drawing **locally** without signing in. No WebSocket connection is made, and no database records are created, ensuring zero server cost for local drafts.

### 2. The "Share" (View-Only) Flow
When a user wants to share their local draft:
1. They are prompted to sign in (if unauthenticated).
2. A `POST /room` request creates a permanent room.
3. A `POST /room/:slug/sync` request pushes all local shapes to the database.
4. The user copies a link appended with `?mode=view`.
5. When a guest visits the link, Next.js detects the URL State, pauses the WebSocket connection, locks the canvas interactions, and prompts the guest for their name to log them as a `Viewer`.

### 3. The "Collaborate" (Real-Time) Flow
When a user wishes to co-author:
1. The same sync process ensures the database is up-to-date.
2. The frontend connects to the `ws-backend` using their JWT token.
3. The real-time synchronization kicks in, actively broadcasting drawing operations to the room.

---

*Designed and engineered for scale, speed, and real-time collaboration.*
