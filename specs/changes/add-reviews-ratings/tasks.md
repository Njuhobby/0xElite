# Implementation Tasks: Reviews & Ratings System

## 1. Database Schema

- [ ] 1.1 Design reviews table schema (reviewer, reviewee, project, rating, comment, etc.)
- [ ] 1.2 Add rating fields to developers table (average_rating, total_reviews, rating_distribution)
- [ ] 1.3 Add rating fields to clients table (average_rating, total_reviews, rating_distribution)
- [ ] 1.4 Write migration script: `004_create_reviews_table.sql`
- [ ] 1.5 Add uniqueness constraint (one review per project per side)
- [ ] 1.6 Add triggers for automatic rating recalculation
- [ ] 1.7 Test migration script

## 2. Backend API Implementation

- [ ] 2.1 Create `backend/src/api/routes/reviews.ts`
- [ ] 2.2 Implement POST /api/reviews (submit review)
- [ ] 2.3 Implement GET /api/reviews/developer/:address (get developer reviews)
- [ ] 2.4 Implement GET /api/reviews/client/:address (get client reviews)
- [ ] 2.5 Implement GET /api/reviews/project/:projectId (get project reviews)
- [ ] 2.6 Implement PUT /api/reviews/:id (edit review within 7 days)
- [ ] 2.7 Add validation (project completed, no duplicates, rating 1-5)
- [ ] 2.8 Add signature verification for review submission
- [ ] 2.9 Implement rating recalculation logic
- [ ] 2.10 Update `backend/src/index.ts` to register review routes

## 3. Matching Algorithm Integration

- [ ] 3.1 Update `matchingAlgorithm.ts` to query average_rating from developers
- [ ] 3.2 Modify reputation scoring to use average_rating (0-10 points)
- [ ] 3.3 Add rating weight configuration (e.g., 5-star = 10 points, 1-star = 0 points)
- [ ] 3.4 Test matching with different rating scenarios

## 4. Frontend Components

- [ ] 4.1 Create `RatingStars.tsx` component (display and input modes)
- [ ] 4.2 Create `ReviewCard.tsx` component (display single review)
- [ ] 4.3 Create `ReviewList.tsx` component (display review list with pagination)
- [ ] 4.4 Create `SubmitReviewModal.tsx` component (review submission form)
- [ ] 4.5 Create `RatingDistribution.tsx` component (5-star breakdown chart)

## 5. Frontend Integration

- [ ] 5.1 Add review submission button to project detail page (when project completed)
- [ ] 5.2 Integrate ReviewList into `/developers/[address]` page
- [ ] 5.3 Integrate ReviewList into client profile view
- [ ] 5.4 Add average rating display to developer profile header
- [ ] 5.5 Add average rating display to client profile
- [ ] 5.6 Show "Already reviewed" state if user submitted review
- [ ] 5.7 Add review edit functionality (within 7 days)
- [ ] 5.8 Add rating filter on developer browse page (optional)

## 6. Testing

- [ ] 6.1 Write unit tests for rating calculation logic
- [ ] 6.2 Write API integration tests for review endpoints
- [ ] 6.3 Test review submission validation (completed projects only)
- [ ] 6.4 Test duplicate review prevention
- [ ] 6.5 Test review editing (within/after 7 days)
- [ ] 6.6 Test rating recalculation accuracy
- [ ] 6.7 Test matching algorithm with ratings

## 7. Edge Cases & Security

- [ ] 7.1 Prevent self-reviews (developer can't review themselves)
- [ ] 7.2 Validate reviewer is actually part of the project (client or assigned developer)
- [ ] 7.3 Handle deleted reviews (soft delete, maintain rating history)
- [ ] 7.4 Rate limiting on review submission (prevent spam)
- [ ] 7.5 Profanity filter for review text (optional)
- [ ] 7.6 Review flagging system (optional, future enhancement)

## 8. Documentation

- [ ] 8.1 Update API documentation with review endpoints
- [ ] 8.2 Add review system to user guide
- [ ] 8.3 Document rating calculation algorithm
- [ ] 8.4 Update README with review feature

## 9. Validation & Deployment

- [ ] 9.1 Run `tigs validate-specs --change add-reviews-ratings`
- [ ] 9.2 Fix any validation errors
- [ ] 9.3 Review all delta specs for completeness
- [ ] 9.4 Archive change: `tigs archive-change add-reviews-ratings`
- [ ] 9.5 Deploy to staging environment
- [ ] 9.6 QA testing on staging
- [ ] 9.7 Deploy to production
- [ ] 9.8 Monitor review submission rates
