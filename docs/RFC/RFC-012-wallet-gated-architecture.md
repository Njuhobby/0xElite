# RFC-012: Wallet-Gated Single-Page Architecture

| Field    | Value                                              |
|----------|----------------------------------------------------|
| RFC      | 012                                                |
| Title    | Wallet-Gated Single-Page Architecture              |
| Author   | 0xElite Team                                       |
| Status   | Accepted                                           |
| Created  | 2026-05-04                                         |
| Updated  | 2026-05-04                                         |

---

## 1. Context

Early frontend scaffolding had two parallel route trees:

- A **dashboard** tree under `/dashboard/{role}/...` that required wallet connection and rendered the role-specific sidebar (client / developer / admin).
- A **public-ish** tree under `/projects/...` (`/projects`, `/projects/[id]`, `/projects/create`) that was styled in a dark "marketing" theme, didn't have the sidebar, and was meant to be accessible to "anyone browsing".

When the developer-facing project detail page was navigated to, the user landed in the dark public tree, even when they were already authenticated and inside the dashboard. The two trees had separate styling, separate state assumptions, and separate URLs — so the same logical resource (a project the dev is working on) had two views.

A separate but related issue: `/disputes/...` lives at the route root because a dispute is shared between client + dev + xELITE-holding voters (no single role owns it). Without a layout it lost the sidebar entirely.

---

## 2. Problem Statement

- Two route trees for the same resource means two themes to maintain, two state assumptions, two sets of bugs.
- "Public marketing" project pages are the wrong instinct for a wallet-gated app. There is no "browse projects" mode for non-authenticated users in the MVP product. Every meaningful action requires a wallet anyway.
- A shared route like `/disputes` should still feel like part of the dashboard for whichever role is visiting; losing the sidebar is jarring.

User-stated preference (recorded in `feedback_minimal_surface.md`): **wallet-gated role-aware single pages, not public/marketing-style architectures**.

---

## 3. Options Considered

### 3.1 Project detail routes

**Option A**: Keep both trees. `/projects/[id]` is "public view"; `/dashboard/{role}/projects/[id]` is "authenticated view".

- **Pros**: Public browsing is theoretically possible.
- **Cons**: No actual public browsing in the product. Two themes, two implementations, two sets of bugs.

**Option B**: Drop the public tree. Project detail lives only under `/dashboard/{role}/projects/[id]` for the role that owns the relationship.

- **Pros**: Single source of truth per role. Clean theme. Wallet gate enforced uniformly.
- **Cons**: A user who pastes a link to a project they're not part of just gets redirected — no public preview. Acceptable in a wallet-gated app.

### 3.2 `/disputes` route

**Option C**: Mirror dispute pages under both `/dashboard/client/disputes/...` and `/dashboard/developer/disputes/...`. Sidebar's "Disputes" link uses each role's path.

- **Pros**: Each route belongs to a clear role tree.
- **Cons**: Disputes are inherently shared (xELITE-holding voters aren't a "role" — they could be either). Mirroring under both trees plus an admin tree is N copies of the same component. Sharing a dispute link across roles requires URL rewriting.

**Option D**: Keep `/disputes/...` at the route root but add a layout that detects the wallet's role and renders the matching `DashboardShell`. For wallets registered as both client and developer, fall back to the most recently visited dashboard (`sessionStorage.lastDashboardRole`).

- **Pros**: Single canonical URL per dispute. Sidebar feels continuous. No URL rewriting.
- **Cons**: The role detection has a small async window during page load; a brief "Loading..." until the layout knows what shell to render.

---

## 4. Decision

Adopt **B + D**.

### 4.1 Project detail consolidation

- Delete `/projects/[id]/page.tsx`, `/projects/create/page.tsx`, `/projects/page.tsx` (the dark/marketing tree).
- The dev's project detail lives at `/dashboard/developer/projects/[id]` — a light-themed mirror of the client page, using the shared `MilestoneCard`. Read-only Reviews section (no Submit Review per RFC-010).
- The dev's project list lives at `/dashboard/developer/projects` — wired to `GET /api/projects?developerAddress=...` with a Link to the detail route.
- Removed "Browse Projects" CTA from the developer empty state (no public browse).

### 4.2 `/disputes` shared layout

- New `frontend/src/app/disputes/layout.tsx` wraps the disputes route tree.
- It checks the wallet via `useAccount`, queries `/api/developers/:address` and `/api/clients/:address`, and:
  - If wallet has a developer profile only → renders the developer `DashboardShell`.
  - If wallet has a client profile only → renders the client `DashboardShell`.
  - If wallet is registered as both → reads `sessionStorage.getItem('lastDashboardRole')` and uses that, falling back to developer (most dispute participation is on the DAO voting side, which is a developer concern).
  - If wallet has neither profile → renders the page bare without a shell (graceful, user can still hit "Back to Home" inside the page).
  - If no wallet → redirects to `/`.
- Each role's dashboard layout (`/dashboard/client/layout.tsx`, `/dashboard/developer/layout.tsx`) writes `sessionStorage.setItem('lastDashboardRole', role)` on mount, so the disputes layout has a recent value to fall back on.

### 4.3 Sidebar links

- Sidebars in both dashboard layouts continue to point Disputes at `/disputes` (canonical URL).
- The disputes layout supplies the role-specific `switchRole` link (Developer ↔ Client) so the user can pivot between dashboards without losing the dispute context.

---

## 5. Consequences

- The frontend has one project detail UI per role — no theme drift.
- A user clicking a dispute link from any context lands on a sidebar-bearing page that fits their role.
- The wallet is the universal credential. There's no logged-out "browse" mode.
- `sessionStorage.lastDashboardRole` is now load-bearing for the dual-role case. If we want a more durable preference, we can promote it to a `developers.preferred_role` column or similar — defer until the dual-role scenario is more common.

---

## 6. Open Questions

- **Voter wallets that are registered as neither dev nor client**. Today they hit the disputes layout's "neither" branch and render bare. If we expand voter eligibility beyond developers (e.g. open up to any xELITE holder regardless of registration), this branch should probably show a minimal voter shell instead. Defer until that eligibility change happens.
- **Public project pages for marketing**. If we ever want a "see what this platform does" landing experience, that's a separate concern from in-app project detail. Build a separate `/marketing/...` tree at that point — don't conflate it with the wallet-gated detail view.

---

## 7. References

- Implementation: `frontend/src/app/disputes/layout.tsx`, `frontend/src/app/dashboard/client/layout.tsx`, `frontend/src/app/dashboard/developer/layout.tsx`, `frontend/src/app/dashboard/developer/projects/[id]/page.tsx`
- Memory: `feedback_minimal_surface.md`
- Related: RFC-009 (tx orchestration — same wallet-gated principle in action)
