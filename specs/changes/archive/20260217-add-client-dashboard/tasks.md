# Implementation Tasks: Client Dashboard

## 1. Backend Preparation

- [x] 1.1 Create `backend/src/types/client.ts` with Client interfaces
- [x] 1.2 Verify existing client API endpoints cover dashboard needs
- [x] 1.3 Add GET /api/projects?clientAddress= filtering (already working)

## 2. Dashboard Layout & Routing

- [x] 2.1 Create `/dashboard/client/layout.tsx` (sidebar, navigation, client status check)
- [x] 2.2 Create sidebar navigation: Profile, Projects, Settings
- [x] 2.3 Add "Main Site" link in sidebar
- [x] 2.4 Add client auto-redirect in `app/page.tsx` for registered clients

## 3. Client Profile Page

- [x] 3.1 Create `/dashboard/client/page.tsx` (default: profile view)
- [x] 3.2 Display client info: company name, email, description, website
- [x] 3.3 Display stats: projects created, projects completed, total spent, rating
- [x] 3.4 Create `EditClientProfileModal.tsx` for editing profile
- [x] 3.5 Handle first-time registration flow (wallet connected but not registered)

## 4. Projects Management Page

- [x] 4.1 Create `/dashboard/client/projects/page.tsx`
- [x] 4.2 List all client projects with status badges and budget info
- [x] 4.3 Create `CreateProjectModal.tsx` (title, description, skills, budget, milestones)
- [x] 4.4 Add project filtering by status (draft, active, completed, disputed)
- [x] 4.5 Link each project card to project detail page

## 5. Project Detail Page

- [x] 5.1 Create `/dashboard/client/projects/[id]/page.tsx`
- [x] 5.2 Display project header (title, status, assigned developer, budget)
- [x] 5.3 Display milestone list with progress tracking
- [x] 5.4 Display escrow status (deposited, released, balance)
- [x] 5.5 Add milestone approval/rejection actions for pending_review milestones
- [x] 5.6 Add review submission button for completed projects
- [x] 5.7 Display existing reviews for the project

## 6. Settings Page

- [x] 6.1 Create `/dashboard/client/settings/page.tsx`
- [x] 6.2 Wallet disconnect with confirmation
- [x] 6.3 Account info display

## 7. Shared Components

- [x] 7.1 Project card inline in projects page (no separate component needed)
- [x] 7.2 Milestone progress bar inline in project detail page
- [x] 7.3 Escrow status cards inline in project detail page
- [x] 7.4 Reuse existing `ReviewList` and `SubmitReviewModal` components

## 8. Validation & Deployment

- [x] 8.1 Run `tigs validate-specs --change add-client-dashboard`
- [x] 8.2 Review all delta specs for completeness
- [ ] 8.3 Archive change: `tigs archive-change add-client-dashboard`
