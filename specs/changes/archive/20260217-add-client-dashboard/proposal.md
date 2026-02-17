# Client Dashboard

## Why

Clients currently have no dedicated UI. They can create projects and deposit escrow via API, but there is no frontend for managing projects, reviewing milestones, monitoring escrow status, or submitting reviews. Without a client dashboard, the platform is only usable from the developer side.

## What Changes

- Add client dashboard layout with sidebar navigation (mirroring developer dashboard pattern)
- Add client profile page with registration/edit form
- Add project management page (list projects, view status, create new project)
- Add project detail page (milestone tracking, escrow status, approve/reject deliverables)
- Add review submission UI for completed projects
- Add auto-redirect for registered clients on homepage
- Add client type definitions in backend

## Impact

- **Affected specs**:
  - `capabilities/client-dashboard/spec.md` (ADDED)
  - `api/client-management/spec.md` (ADDED - documenting existing + new endpoints)

- **Affected code**:
  - Frontend: New `/dashboard/client/` route tree (layout, profile, projects, project detail)
  - Frontend: New client-specific components (ProjectCard, MilestoneTracker, EscrowStatus, CreateProjectModal)
  - Frontend: Update `app/page.tsx` to redirect registered clients
  - Backend: Add `types/client.ts` for TypeScript interfaces

## Success Criteria

- Registered clients see client dashboard after connecting wallet
- Clients can view and edit their profile
- Clients can create new projects with milestones
- Clients can view all their projects with status
- Clients can view project detail with milestone progress and escrow balance
- Clients can submit reviews for completed projects
- Clients can navigate to main site from dashboard
