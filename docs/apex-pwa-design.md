# Apex PWA Frontend — Design Document

> **Status:** Approved — ready for implementation
> **Repository:** `gearbox/apex-frontend` (separate from backend `gearbox/apex`)
> **Last updated:** 2026-03-10

---

## 1. Product Summary

Apex is an AI media generation platform. The PWA is a mobile-first, installable web app that lets users generate images and videos, browse their gallery, buy tokens, and manage their account. It talks to the Apex REST API (Litestar backend) via HTTPS and is deployed as a static SPA on Cloudflare Pages.

---

## 2. Stack Decision

| Layer | Choice | Version |
|-------|--------|---------|
| Framework | SvelteKit (static adapter) | 2.x |
| Language | TypeScript (strict) | 5.x |
| Styling | Tailwind CSS | 4.x |
| State | Svelte stores + TanStack Query | latest |
| API Client | `openapi-fetch` | latest |
| PWA | `@vite-pwa/sveltekit` | latest |
| Icons | `lucide-svelte` | latest |
| Fonts | DM Sans + JetBrains Mono (Google Fonts) | — |
| Package Manager | pnpm | latest |
| Hosting | Cloudflare Pages | — |

### Why SvelteKit

- Compiles to vanilla JS — ~40KB gzipped vs ~80–120KB for React/Next.js
- `@sveltejs/adapter-static` gives pure static output for Cloudflare Pages with no Node runtime
- Reactive stores + `$state` / `$derived` eliminate useState/useEffect boilerplate
- Perfect for media-heavy UIs where bundle size matters

### Rejected Alternatives

| Approach | Verdict | Reason |
|----------|---------|--------|
| React SPA (Vite) | Acceptable fallback | Larger bundles, more boilerplate |
| Next.js | Avoid | Server-centric model fights PWA architecture |
| Flutter Web | Avoid | Large WASM bundle, non-standard web |
| HTMX + Jinja in Litestar | Avoid | Couples FE to BE, no offline, poor interactivity |

---

## 3. Architecture

```
┌──────────────────────────────────────────────-───────┐
│                  Cloudflare Pages                    │
│  ┌──────────────────────────────────────────────-─┐  │
│  │            SvelteKit Static Build              │  │
│  │  ┌─────-──-──┐ ┌──────────┐ ┌───────────────┐  │  │
│  │  │ Service   │ │   App    │ │   Manifest    │  │  │
│  │  │ Worker    │ │  Shell   │ │  + Icons      │  │  │
│  │  └────┬─────-┘ └────┬─────┘ └───────────────┘  │  │
│  └───────┼─────────────┼─────────────────────────-┘  │
└──────────┼─────────────┼──────────────────────────-──┘
           │             │
           │  ┌──────────▼──────────┐
           │  │   API Client Layer  │
           │  │  (openapi-fetch)    │
           │  │  JWT interceptor    │
           │  │  refresh rotation   │
           │  └──────────┬──────────┘
           │             │
           │  ┌──────────▼──────────┐
           │  │    Apex REST API    │
           │  │  (Litestar backend) │
           │  └──────────┬──────────┘
           │             │
           │  ┌──────────▼──────────┐
           │  │   Cloudflare R2     │
           │  │  (presigned URLs)   │
           │  └─────────────────────┘
           │
    ┌──────▼─────────-┐
    │  Offline Cache  │
    │  - App shell    │
    │  - Pricing data │
    └─────────-───────┘
```

### Layered Architecture

```
Routes (Pages) → Components (UI) → Stores (State) → API Client (Network)
     ↓                 ↓                 ↓                  ↓
  SvelteKit        Svelte 5        Writable/Derived     openapi-fetch
  routing          components       + TanStack Query     typed client
```

### Repository Separation

- **Backend:** `gearbox/apex` — Python/Litestar API
- **Frontend:** `gearbox/apex-frontend` — SvelteKit PWA
- **Sync point:** OpenAPI schema (`GET /docs/openapi.json` from backend → `src/lib/api/schema.json` in frontend)
- **Contract reference:** `BACKEND_API_REFERENCE.md` in frontend Claude Project knowledge

---

## 4. Theme System

### Two Named Themes × Light/Dark Variants

| Theme | Vibe | Light Accent | Dark Accent |
|-------|------|-------------|-------------|
| **Slate** | Warm earth tones | `#b45309` (amber) | `#d97706` (amber) |
| **Frost** | Cool blue tones | `#6366f1` (indigo) | `#818cf8` (indigo) |

Each theme defines 14 color tokens: `bg`, `surface`, `surfaceHover`, `border`, `borderActive`, `text`, `textMuted`, `textDim`, `accent`, `accentDim`, `accentGlow`, `success`, `warning`, `danger`.

### Color Values

**Slate Light:**
`bg: #faf8f5, surface: #ffffff, border: #e0d8cc, text: #2a2520, accent: #b45309`

**Slate Dark:**
`bg: #110f0b, surface: #1a1710, border: #2e2a1e, text: #ede8dc, accent: #d97706`

**Frost Light:**
`bg: #f5f7fa, surface: #ffffff, border: #dde2ea, text: #1a2030, accent: #6366f1`

**Frost Dark:**
`bg: #080810, surface: #10101e, border: #20203a, text: #e0e0f0, accent: #818cf8`

### Mode Selection

Three options: **Light**, **Dark**, **System** (follows OS preference via `prefers-color-scheme`).

### Persistence

`localStorage` key `apex-theme-prefs`: `{ "theme": "slate", "mode": "dark" }`

### Application

Colors applied as CSS custom properties on `<body>`. Tailwind references them via `theme.extend.colors`. Smooth transitions (0.35s) on theme switch.

### UI Location

Theme and mode selectors live on the **Profile page** under an "Appearance" section:
- **Theme:** Card-based picker with color swatches (Slate vs Frost)
- **Mode:** Segmented control with Sun / Moon / Monitor icons

---

## 5. Responsive Layout

### Breakpoints

| Width | Layout |
|-------|--------|
| `< 768px` | **Mobile:** bottom tab bar, full-width content, sticky bars |
| `≥ 768px` | **Desktop:** collapsible sidebar, side-by-side panels |

Retina handling: CSS logical pixels throughout. An iPhone 15 Pro (393 logical px at 3x DPR) correctly hits the mobile breakpoint. All icons are SVG, fonts are vector.

### Mobile Layout

**Bottom tab bar** — 3 items (extensible `TAB_ITEMS` array):

| Tab | Icon | Action |
|-----|------|--------|
| Create | Plus | Navigate to `/app/create` |
| Gallery | Image | Navigate to `/app/gallery` |
| More | VerticalDots | Open bottom sheet |

**"More" bottom sheet** — secondary items (extensible `MORE_ITEMS` array):

| Item | Icon | Action |
|------|------|--------|
| Billing & Tokens | Coins | Navigate to `/app/billing` |
| Job History | Activity | Navigate to `/app/jobs` |
| Profile & Settings | User | Navigate to `/app/profile` |

Bottom tabs include `env(safe-area-inset-bottom)` padding for iPhone home indicator.

Adding a new tab or More item = appending one object to the corresponding array.

### Desktop Layout

**Collapsible sidebar** — 220px expanded ↔ 60px icon-only. All nav items visible (Create, Gallery, Jobs, Billing, Profile). Collapse state persisted in `localStorage`.

### Top Bar (Both Layouts)

- **Left:** Logo ("apex") + current page title
- **Right:** Token balance pill (clickable → navigates to `/app/billing`) + user avatar (clickable → navigates to `/app/profile`)

---

## 6. Page Designs

### 6.1 Generation Studio (`/app/create`)

The primary workspace.

**Mobile layout:** Single-column scroll → model → type → upload (if needed) → prompt → params → results area. **Sticky bottom bar** with Generate button + cost preview, always visible.

**Desktop layout:** Side-by-side: left panel (400px) with controls + inline Generate button, right panel with results/preview.

**Components:**
- **Model selector** — 3 cards: Grok Imagine (✦), Grok 2 (◈), Grok Video (▶)
- **Type selector** — filtered by model capabilities: Text→Image, Image→Image, Text→Video, Image→Video
- **Image upload** — drag-and-drop zone, shown only for I2I/I2V modes, calls `POST /v1/storage/upload`
- **Prompt input** — textarea with character counter (max 4096)
- **Parameters panel** — aspect ratio chips (1:1, 16:9, 9:16, 4:3, 3:4), image count (1–4) for images, duration (1–15s) + resolution (480p/720p) for video
- **Cost preview** — calculated from pricing catalog: "◈ {cost × count}"
- **Generate button** — disabled until prompt is non-empty, shows cost, progress bar during generation
- **Results panel** — generated outputs with download and re-generate actions

**Job polling:** `GET /v1/jobs/{id}` every 2s while status is `pending`, `queued`, or `running`. Stop on terminal status.

### 6.2 Gallery (`/app/gallery`)

- **Grid:** 2 columns on mobile, `auto-fill(minmax(200px, 1fr))` on desktop
- **Filter bar:** All / Images / Videos pill toggles + item count
- **Cards:** Gradient placeholder thumbnails (real images via presigned URLs in production), video badge with play icon, prompt text, time ago, token cost
- **Lightbox:** Full-screen overlay with metadata (model, ratio, cost), download button, re-generate button, close (X) button
- **Pagination:** Infinite scroll (increment `offset` on scroll to bottom)

### 6.3 Billing (`/app/billing`)

Three tabs:

**Overview:**
- Large balance card with account type, monthly spend, generation count
- Cost-per-generation reference grid (3 cards: Imagine ◈5, Grok 2 ◈8, Video ◈25)

**Buy Tokens:**
- Package cards: Starter ($4.99 / 500), Creator ($9.99 / 1,200 +10%), Pro ($19.99 / 3,000 +20%), Studio ($49.99 / 8,000 +30%)
- "Popular" badge on Creator package
- Payment buttons: Stripe (primary) + Crypto (secondary)
- Mobile: single-column stack; Desktop: 2×2 grid

**History:**
- Transaction list with type indicator (+ credit green, − debit neutral, ↩ refund yellow)
- Description, time ago, amount, running balance

### 6.4 Profile (`/app/profile`)

- User avatar + name + email
- Fields: Display Name, Account Type, Member Since
- **Appearance section:** Theme selector + Mode selector (described in §4)
- Actions: Change Password, Logout All Devices, Delete Account (danger)

### 6.5 Jobs (`/app/jobs`)

- Placeholder for Phase 2+
- List of running and completed generation jobs with status badges

---

## 7. Authentication

### Token Model
- Access token: short-lived JWT (15 min), stored in memory only
- Refresh token: long-lived (7 days), stored in `localStorage`
- Rotation: every refresh issues a new token pair, old refresh token invalidated
- Family tracking: reusing a revoked token kills the entire family (theft detection)

### Interceptor
`openapi-fetch` middleware:
1. Adds `Authorization: Bearer <access_token>` to every request
2. On 401: attempt refresh with stored refresh token
3. If refresh succeeds: retry original request with new token
4. If refresh fails: clear auth state, redirect to `/login?redirect=<current_path>`

### Auth Guard
`(app)/+layout.svelte` checks auth on mount → attempt silent refresh → redirect if unauthenticated → show skeleton while checking.

---

## 8. PWA Configuration

### Manifest
- Name: "Apex — AI Content Studio"
- Short name: "Apex"
- Display: standalone
- Theme color: `#110f0b` (Slate Dark bg)
- Icons: 192px + 512px (+ maskable)

### Service Worker Caching

| Resource | Strategy | TTL |
|----------|----------|-----|
| App shell (HTML/JS/CSS) | Precache | Until next deploy |
| `/v1/billing/packages` | Stale-while-revalidate | 1 hour |
| `/v1/billing/pricing` | Stale-while-revalidate | 1 hour |
| `/v1/grok/` (provider info) | Stale-while-revalidate | 1 hour |
| `/v1/jobs`, `/gallery` | Network-first | No cache |
| R2 presigned images | Cache-first | Until URL expires (~1h) |

### Viewport

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
```

---

## 9. API Schema Sync

The frontend and backend live in separate repositories. The sync point is the OpenAPI schema.

### Export from Backend

```bash
curl http://localhost:8000/docs/openapi.json > src/lib/api/schema.json
```

Note: Litestar's `OpenAPIConfig` in the backend is set to `path="/docs"`, so the schema lives at `/docs/openapi.json` (not the Litestar default `/schema/openapi.json`).

### Generate TypeScript Types

```bash
npx openapi-typescript src/lib/api/schema.json -o src/lib/api/types.ts
```

### When to Sync

Re-export and regenerate types whenever backend API endpoints change. TypeScript compilation errors will flag any contract breaks immediately.

---

## 10. Route Structure

```
/                       → Landing / redirect to /app/create
/login                  → Login form
/register               → Registration form
/forgot-password        → Password reset flow
/verify-email           → Email verification handler

/app                    → App shell (authenticated, contains layout)
  /app/create           → Generation studio
  /app/gallery          → Output gallery grid
  /app/jobs             → Job history list
  /app/jobs/:id         → Job detail view
  /app/billing          → Balance + transactions (Overview/Buy/History tabs)
  /app/billing/buy      → Token purchase page
  /app/profile          → User settings + appearance
```

---

## 11. Development Phases

### Phase 1: Foundation
- Project scaffold (SvelteKit + Tailwind + PWA)
- Theme system with CSS variables + localStorage
- Responsive layout (AppShell, sidebar, bottom tabs, More sheet)
- Auth flow (login, register, token rotation, guards)
- API client with typed endpoints
- Route structure with placeholder pages

### Phase 2: Core Features
- Generation Studio (Create page) — T2I first
- Job polling and results display
- Gallery with infinite scroll and lightbox
- Balance display with live updates

### Phase 3: Billing & Polish
- Token purchase flow (Stripe checkout redirect)
- Transaction history
- Profile management
- PWA install prompt

### Phase 4: Advanced
- Video generation (T2V, I2V)
- Image upload for I2I/I2V
- Job history page with filters
- Organization management
- SSE/WebSocket for real-time job progress (pending backend support)

---

## 12. Reference Artifacts

| Document | Purpose | Location |
|----------|---------|----------|
| `CLAUDE.md` | Frontend project conventions | Repo root + Claude Project knowledge |
| `BACKEND_API_REFERENCE.md` | API contract snapshot | Claude Project knowledge only |
| `docs/apex-pwa-design.md` | This document — design decisions | Repo `docs/` + Claude Project knowledge |
| `apex-pwa-frontend-scaffold-prompt.md` | Claude Code prompt for Phase 1 | One-time use |
| `mockups/apex-pwa-responsive.jsx` | Interactive React mockup | Repo `mockups/`. Reference only (translate to Svelte) |
| `src/lib/api/schema.json` | OpenAPI schema from backend | Committed to frontend repo |
