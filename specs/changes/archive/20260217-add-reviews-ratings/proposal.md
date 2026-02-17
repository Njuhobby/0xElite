# Reviews & Ratings System

## Why

After project completion, both clients and developers need a way to provide feedback and build reputation. Currently, the matching algorithm uses a basic reputation score, but there's no mechanism for users to actually earn reputation through quality work. A bidirectional review system enables:

- Developers to build credibility through client reviews
- Clients to demonstrate reliability through developer reviews
- Platform to surface quality developers via ratings
- Matching algorithm to prioritize high-rated developers

## What Changes

- Add bidirectional review submission (client → developer, developer → client)
- Implement 5-star rating system with text reviews
- Calculate and display average ratings on profiles
- Track review counts and rating distributions
- Integrate rating scores into matching algorithm
- Display reviews on developer and client profiles
- Enforce one review per project per side (client can review developer once, developer can review client once)
- Allow reviews only after project completion
- Support review editing within 7 days of submission

## Impact

- **Affected specs**:
  - `capabilities/review-management/spec.md` (ADDED)
  - `data-models/review/schema.md` (ADDED)
  - `data-models/developer/schema.md` (MODIFIED - add rating fields)
  - `data-models/client/schema.md` (MODIFIED - add rating fields)
  - `api/review-management/spec.md` (ADDED)

- **Affected code**:
  - Backend: New `reviews.ts` API routes
  - Backend: Update `matchingAlgorithm.ts` to use average_rating
  - Backend: New migration `004_create_reviews_table.sql`
  - Frontend: New review submission modal/form
  - Frontend: Review display on `/developers/[address]` and project pages
  - Frontend: Rating stars component

## Success Criteria

- Client can submit review for developer after project completion
- Developer can submit review for client after project completion
- Reviews display on developer and client profiles
- Average ratings calculate correctly and update in real-time
- Matching algorithm considers average_rating in scoring
- Users can edit reviews within 7 days
- Cannot submit duplicate reviews for same project
- Cannot review before project completion
- 5-star rating distribution displays correctly
