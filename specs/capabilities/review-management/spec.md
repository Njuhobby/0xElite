

## Requirements



### Requirement: Review Submission After Project Completion

The system SHALL allow clients and developers to submit reviews only after project completion.

#### Scenario: Client submits review for completed project

- **WHEN** a client submits a review for a completed project
- **THEN** the system creates a review record with rating (1-5 stars) and optional text comment
- **AND** updates the developer's average rating and review count
- **AND** returns the created review with timestamp

#### Scenario: Developer submits review for completed project

- **WHEN** a developer submits a review for a completed project
- **THEN** the system creates a review record for the client
- **AND** updates the client's average rating and review count
- **AND** returns the created review with timestamp

#### Scenario: User attempts to review incomplete project

- **WHEN** a user attempts to submit a review for a project that is not completed
- **THEN** the system rejects the request with error "PROJECT_NOT_COMPLETED"
- **AND** does not create a review record

### Requirement: One Review Per Project Per Side

The system SHALL enforce that each user can submit only one review per project from their perspective (client reviews developer once, developer reviews client once).

#### Scenario: User attempts duplicate review

- **WHEN** a user attempts to submit a second review for the same project
- **THEN** the system rejects the request with error "REVIEW_ALREADY_EXISTS"
- **AND** does not create a duplicate review

#### Scenario: Both sides review same project

- **WHEN** client submits review for developer on Project A
- **AND** developer submits review for client on Project A
- **THEN** both reviews are created successfully
- **AND** each review is stored separately

### Requirement: Rating Validation

The system SHALL validate that all ratings are integers between 1 and 5 (inclusive).

#### Scenario: Valid rating submission

- **WHEN** a user submits a review with rating = 5
- **THEN** the system accepts the rating
- **AND** creates the review successfully

#### Scenario: Invalid rating (out of range)

- **WHEN** a user submits a review with rating = 0 or rating = 6
- **THEN** the system rejects the request with error "INVALID_RATING"
- **AND** does not create the review

#### Scenario: Invalid rating (non-integer)

- **WHEN** a user submits a review with rating = 3.5
- **THEN** the system rejects the request with error "INVALID_RATING"
- **AND** does not create the review

### Requirement: Review Text Validation

The system SHALL accept optional review text with maximum length of 1000 characters.

#### Scenario: Review with valid text

- **WHEN** a user submits a review with 200-character comment
- **THEN** the system accepts the review
- **AND** stores the comment text

#### Scenario: Review without text

- **WHEN** a user submits a review with rating only (no text)
- **THEN** the system accepts the review
- **AND** stores NULL for comment field

#### Scenario: Review text exceeds limit

- **WHEN** a user submits a review with 1500-character comment
- **THEN** the system rejects the request with error "COMMENT_TOO_LONG"
- **AND** does not create the review

### Requirement: Automatic Rating Calculation

The system SHALL automatically recalculate average ratings and review counts when reviews are submitted or edited.

#### Scenario: First review submission

- **WHEN** a developer receives their first review with rating = 5
- **THEN** the developer's average_rating becomes 5.0
- **AND** total_reviews becomes 1
- **AND** rating_distribution shows {5: 1, 4: 0, 3: 0, 2: 0, 1: 0}

#### Scenario: Subsequent review submission

- **WHEN** a developer with average_rating = 5.0 and total_reviews = 1 receives a new review with rating = 3
- **THEN** the average_rating becomes 4.0 ((5 + 3) / 2)
- **AND** total_reviews becomes 2
- **AND** rating_distribution shows {5: 1, 4: 0, 3: 1, 2: 0, 1: 0}

#### Scenario: Review edit affects rating

- **WHEN** a user edits a review from rating = 5 to rating = 4
- **THEN** the reviewee's average_rating is recalculated
- **AND** rating_distribution is updated (5-star count decreases, 4-star count increases)

### Requirement: Review Editing Window

The system SHALL allow review authors to edit their reviews within 7 days of submission.

#### Scenario: Edit review within 7 days

- **WHEN** a user edits their review 3 days after submission
- **THEN** the system updates the review rating and/or comment
- **AND** updates the updated_at timestamp
- **AND** recalculates the reviewee's rating

#### Scenario: Attempt edit after 7 days

- **WHEN** a user attempts to edit their review 10 days after submission
- **THEN** the system rejects the request with error "EDIT_WINDOW_EXPIRED"
- **AND** does not modify the review

### Requirement: Review Visibility

The system SHALL display reviews on developer and client profiles, visible to all users (public).

#### Scenario: View developer reviews

- **WHEN** any user visits a developer profile
- **THEN** the system displays all reviews received by that developer
- **AND** shows average rating and total review count
- **AND** shows rating distribution breakdown

#### Scenario: View client reviews

- **WHEN** any user visits a client profile (if implemented)
- **THEN** the system displays all reviews received by that client
- **AND** shows average rating and total review count

### Requirement: Reviewer Authorization

The system SHALL verify that the reviewer is actually part of the project (either the client or the assigned developer).

#### Scenario: Authorized client reviews developer

- **WHEN** the client of Project A submits a review for the assigned developer
- **THEN** the system accepts the review
- **AND** creates the review record

#### Scenario: Unauthorized user attempts review

- **WHEN** a wallet address that is neither the client nor assigned developer attempts to review Project A
- **THEN** the system rejects the request with error "UNAUTHORIZED"
- **AND** does not create a review

#### Scenario: Prevent self-review

- **WHEN** a developer attempts to review themselves (edge case with test data)
- **THEN** the system rejects the request with error "CANNOT_SELF_REVIEW"
- **AND** does not create a review

### Requirement: Review Display Ordering

The system SHALL display reviews in reverse chronological order (newest first) by default.

#### Scenario: Multiple reviews on profile

- **WHEN** a developer has 5 reviews submitted over time
- **THEN** the reviews display with most recent review first
- **AND** oldest review last

### Requirement: Review Pagination

The system SHALL paginate review lists when more than 20 reviews exist.

#### Scenario: Request first page of reviews

- **WHEN** a user requests reviews for a developer with 50 total reviews
- **THEN** the system returns the first 20 reviews
- **AND** includes pagination metadata (total count, current page, total pages)

#### Scenario: Request specific page

- **WHEN** a user requests page 2 of reviews (limit 20, offset 20)
- **THEN** the system returns reviews 21-40
- **AND** updates pagination metadata

## Related Specs

- **Data Models**: `data-models/review/schema.md`, `data-models/developer/schema.md`, `data-models/client/schema.md`
- **APIs**: `api/review-management/spec.md`
