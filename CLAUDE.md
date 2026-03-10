# CLAUDE.md — Apex Frontend

## Project Overview

This is **apex-frontend** — the Progressive Web App for the Apex AI content generation platform. It's a SvelteKit-based SPA that talks to the Apex REST API (a separate repository: `gearbox/apex`).

The app lets users generate AI images/videos, browse their gallery, manage tokens, and purchase credits. It targets both mobile (primary) and desktop.

---

## Tech Stack

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | SvelteKit 2.x | Static adapter (`@sveltejs/adapter-static`) |
| Language | TypeScript | Strict mode, no `any` |
| Styling | Tailwind CSS 4.x | Utility-first, theme via CSS variables |
| State | Svelte stores + `@tanstack/svelte-query` | Server-state cache with auto revalidation |
| API Client | `openapi-fetch` | Type-safe, generated from backend OpenAPI schema |
| PWA | `@vite-pwa/sveltekit` | Service worker, manifest, offline caching |
| Icons | `lucide-svelte` | Tree-shakeable SVG icons |
| Package Manager | pnpm | Lockfile committed |
| Linting | ESLint + Prettier + `eslint-plugin-svelte` | Enforced in CI |
| Hosting | Cloudflare Pages | Pure static, no server functions needed |

---

## Project Structure

```
src/
├── lib/
│   ├── api/
│   │   ├── client.ts              # openapi-fetch instance + auth interceptor
│   │   ├── auth.ts                # JWT token management, refresh rotation
│   │   ├── types.ts               # Generated from backend OpenAPI schema
│   │   └── schema.json            # Exported OpenAPI schema (source of truth)
│   ├── stores/
│   │   ├── auth.ts                # Auth state: user, tokens, isAuthenticated
│   │   ├── theme.ts               # Theme + mode persistence (localStorage)
│   │   └── ui.ts                  # Sidebar collapsed state, mobile nav
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.svelte       # Root layout: sidebar (desktop) / tabs (mobile)
│   │   │   ├── DesktopSidebar.svelte # Collapsible sidebar
│   │   │   ├── MobileBottomTabs.svelte
│   │   │   ├── MobileMoreSheet.svelte
│   │   │   ├── TopBar.svelte
│   │   │   └── BalancePill.svelte    # Token balance → links to /app/billing
│   │   ├── create/
│   │   │   ├── ModelSelector.svelte
│   │   │   ├── TypeSelector.svelte
│   │   │   ├── PromptInput.svelte
│   │   │   ├── ParamsPanel.svelte
│   │   │   ├── ImageUpload.svelte
│   │   │   ├── GenerateButton.svelte # Inline (desktop) or sticky bar (mobile)
│   │   │   ├── ResultsPanel.svelte
│   │   │   └── CostPreview.svelte
│   │   ├── gallery/
│   │   │   ├── GalleryGrid.svelte    # 2-col mobile, auto-fill desktop
│   │   │   ├── GalleryCard.svelte
│   │   │   ├── GalleryFilters.svelte
│   │   │   └── Lightbox.svelte
│   │   ├── billing/
│   │   │   ├── BalanceCard.svelte
│   │   │   ├── PackageGrid.svelte
│   │   │   ├── TransactionList.svelte
│   │   │   └── CostReference.svelte
│   │   └── profile/
│   │       ├── ThemeSelector.svelte   # Slate / Frost card picker
│   │       ├── ModeSelector.svelte    # Light / Dark / System toggle
│   │       └── ProfileFields.svelte
│   ├── themes/
│   │   └── index.ts                  # Theme definitions + types
│   └── utils/
│       ├── breakpoints.ts            # Reactive viewport width store
│       ├── format.ts                 # Number formatting, relative time
│       └── constants.ts              # API base URL, storage keys
├── routes/
│   ├── +layout.svelte                # Root: fonts, theme CSS vars, QueryClient
│   ├── +layout.ts                    # SSG prerender config
│   ├── +page.svelte                  # Landing / redirect to /app/create
│   ├── (auth)/
│   │   ├── login/+page.svelte
│   │   ├── register/+page.svelte
│   │   ├── forgot-password/+page.svelte
│   │   └── verify-email/+page.svelte
│   └── (app)/
│       ├── +layout.svelte            # AppShell + auth guard
│       └── app/
│           ├── create/+page.svelte
│           ├── gallery/+page.svelte
│           ├── billing/+page.svelte
│           ├── billing/buy/+page.svelte
│           ├── jobs/+page.svelte
│           ├── jobs/[id]/+page.svelte
│           └── profile/+page.svelte
├── static/
│   ├── favicon.svg
│   ├── apple-touch-icon.png          # 180×180
│   ├── icon-192.png
│   └── icon-512.png
├── svelte.config.js
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Architecture Principles

### Layered Frontend Architecture

```
Routes (Pages)  →  Components (UI)  →  Stores (State)  →  API Client (Network)
      ↓                  ↓                   ↓                    ↓
  SvelteKit         Svelte 5          Writable/Derived       openapi-fetch
  routing           components         + TanStack Query       typed client
```

- **Routes** — page-level composition, data loading, guards
- **Components** — reusable UI, no direct API calls (receive data via props or stores)
- **Stores** — auth state, theme, UI state; server data via TanStack Query
- **API Client** — single `openapi-fetch` instance with auth interceptor

### Key Conventions

1. **TypeScript strict** — no `any`, no `@ts-ignore` without justification
2. **Components are single-file `.svelte`** — no separate CSS/JS files
3. **No barrel exports** — import directly from component/module files
4. **Tailwind only** — no inline styles, no CSS modules; theme via CSS custom properties
5. **Reactive stores for cross-component state** — auth, theme, UI; component-local state uses `$state`
6. **TanStack Query for server state** — no manual fetch+useState patterns for API data
7. **Mobile-first** — all CSS starts with mobile, `md:` breakpoint for desktop

---

## Theme System

### Two Named Themes × Light/Dark Variants

| Theme | Light accent | Dark accent | Vibe |
|-------|-------------|-------------|------|
| **Slate** | `#b45309` (amber) | `#d97706` (amber) | Warm earth tones |
| **Frost** | `#6366f1` (indigo) | `#818cf8` (indigo) | Cool blue tones |

Each theme defines 14 color tokens: `bg`, `surface`, `surfaceHover`, `border`, `borderActive`, `text`, `textMuted`, `textDim`, `accent`, `accentDim`, `accentGlow`, `success`, `warning`, `danger`.

### Storage

Persisted in `localStorage` key `apex-theme-prefs`:
```json
{ "theme": "slate", "mode": "dark" }
```

### Application

Colors are applied as CSS custom properties on `<body>`. Tailwind references them via `theme.extend.colors`. Transitions on `background-color` and `color` (0.35s) for smooth theme switching.

### Mode Resolution

- `"light"` → use `themes[name].light`
- `"dark"` → use `themes[name].dark`
- `"system"` → check `window.matchMedia('(prefers-color-scheme: dark)')`, listen for changes

---

## Responsive Layout

### Breakpoints

| Width | Layout |
|-------|--------|
| `< 768px` | Mobile: bottom tab bar + full-width content |
| `≥ 768px` | Desktop: collapsible sidebar + side-by-side panels |

Retina devices report CSS logical pixels (iPhone 15 Pro = 393px → hits mobile layout).

### Mobile Navigation

**Bottom tab bar** — 3 items (extensible `TAB_ITEMS` array):
- Create, Gallery, More

**"More" bottom sheet** — secondary items (extensible `MORE_ITEMS` array):
- Billing & Tokens, Job History, Profile & Settings

Includes `env(safe-area-inset-bottom)` for iPhone home indicator.

### Desktop Sidebar

Collapsible: 220px expanded ↔ 60px icon-only. All nav items visible. Collapse state in `localStorage`.

### Create Page

- **Mobile:** Single-column scroll. Sticky bottom bar with Generate button + cost preview.
- **Desktop:** Side-by-side: left panel (400px) with controls, right panel with results.

---

## Authentication

### Flow

1. User logs in → backend returns `{ access_token, refresh_token, expires_in, expires_at }`
2. Access token stored **in memory only** (Svelte store)
3. Refresh token stored in `localStorage`
4. `openapi-fetch` interceptor adds `Authorization: Bearer <token>` to all requests
5. On 401: attempt silent refresh with stored refresh token
6. If refresh fails: clear state, redirect to `/login?redirect=<current_path>`
7. Backend implements **refresh token rotation with family tracking** — reusing a revoked token kills all tokens in the family (theft detection)

### Auth Guard

`(app)/+layout.svelte` checks auth on mount:
1. Has access token? → proceed
2. Has refresh token in localStorage? → attempt silent refresh
3. Neither? → redirect to `/login`
4. Show skeleton while checking

---

## API Schema Sync

The backend API contract is captured in `src/lib/api/schema.json` (OpenAPI 3.x). TypeScript types are generated from it.

### Update Workflow

When the backend API changes:

```bash
# 1. Export fresh schema from running backend
curl http://localhost:8000/docs/openapi.json > src/lib/api/schema.json

# 2. Regenerate TypeScript types
npx openapi-typescript src/lib/api/schema.json -o src/lib/api/types.ts

# 3. Verify — any breaking changes will surface as TS errors
pnpm check
```

The `BACKEND_API_REFERENCE.md` document in this project's Claude Project knowledge provides a stable reference for the full API surface, enums, and auth model.

---

## Common Commands

```bash
# Development
pnpm dev                    # Start dev server (localhost:5173)
pnpm build                  # Production build → build/
pnpm preview                # Preview production build locally

# Code Quality
pnpm check                  # svelte-check (TS + Svelte)
pnpm lint                   # ESLint
pnpm format                 # Prettier

# Testing
pnpm test                   # Vitest
pnpm test:watch             # Watch mode

# API Types
pnpm gen:api                # Regenerate types from schema.json
```

---

## Environment Variables

```env
# .env (local dev)
VITE_API_BASE_URL=http://localhost:8000

# Cloudflare Pages (production)
VITE_API_BASE_URL=https://api.apex.example.com
```

---

## Build & Deploy

### Cloudflare Pages

- Build command: `pnpm install && pnpm build`
- Output directory: `build`
- Node.js version: 20+
- No server-side functions — pure static SPA
- CORS handled by backend (`allow_origins` in Litestar config)

---

## Testing

**Framework:** Vitest + `@testing-library/svelte`

Test coverage targets:
- **Stores:** theme persistence, auth flow (login/refresh/logout), UI state
- **API client:** interceptor behavior (401 retry, token rotation)
- **Components:** key components render without errors, responsive behavior
- **Utils:** formatting functions, breakpoint detection

---

## Code Style

- **Prettier** with Svelte plugin — `printWidth: 100`, `singleQuote: true`
- **ESLint** — `eslint-plugin-svelte` strict rules
- **No inline styles** — Tailwind utility classes only
- **Import convention:** relative imports within `$lib/`, `$app/` for SvelteKit internals
- **File naming:** `PascalCase.svelte` for components, `camelCase.ts` for modules
