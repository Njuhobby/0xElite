# Implementation Tasks: Developer Onboarding

## 1. Smart Contract: StakeVault

- [ ] 1.1 Write StakeVault.sol contract
  - [ ] stake(amount) function
  - [ ] getStake(address) view function
  - [ ] unstake(amount) function (basic, full logic deferred)
  - [ ] setRequiredStake(amount) owner function
  - [ ] Staked/Unstaked events
- [ ] 1.2 Write Foundry tests
  - [ ] Test stake with sufficient amount
  - [ ] Test stake with insufficient amount
  - [ ] Test stake transfer failure handling
  - [ ] Test getStake query
  - [ ] Test setRequiredStake access control
- [ ] 1.3 Deploy to local Hardhat network
- [ ] 1.4 Deploy to Sepolia testnet

## 2. Backend: Database Schema

- [ ] 2.1 Design developers table schema
- [ ] 2.2 Write migration scripts (SQL or ORM)
- [ ] 2.3 Test migrations up/down
- [ ] 2.4 Add indexes (email, walletAddress, githubUsername)
- [ ] 2.5 Update database documentation

## 3. Backend: API Implementation

- [ ] 3.1 Implement POST /developers endpoint
  - [ ] Wallet signature verification
  - [ ] Request validation (email format, skills count, etc.)
  - [ ] Check uniqueness (wallet, email, GitHub)
  - [ ] Create developer record with status='pending'
- [ ] 3.2 Implement GET /developers/:address endpoint
  - [ ] Return public profile data
  - [ ] Hide sensitive fields (email) for non-owner
- [ ] 3.3 Implement PUT /developers/:address endpoint
  - [ ] Wallet signature verification
  - [ ] Only allow owner to edit
  - [ ] Validate updated fields
- [ ] 3.4 Implement GET /developers endpoint (list, with filters)
  - [ ] Pagination support
  - [ ] Filter by skills, availability
  - [ ] Sort by reputation (future), joinedAt
- [ ] 3.5 Write unit tests for all endpoints
- [ ] 3.6 Write integration tests

## 4. Backend: Event Listener

- [ ] 4.1 Implement stake event listener service
  - [ ] Connect to blockchain RPC
  - [ ] Listen to StakeVault.Staked events
  - [ ] Handle event: update developer.stakeAmount
  - [ ] Handle event: update developer.status to 'active'
  - [ ] Send welcome email
- [ ] 4.2 Implement retry logic for failed event processing
- [ ] 4.3 Add monitoring/alerting for listener health
- [ ] 4.4 Test event processing with local blockchain
- [ ] 4.5 Test event processing with Sepolia testnet

## 5. Frontend: Apply Page

- [ ] 5.1 Create /apply page and route
- [ ] 5.2 Build DeveloperApplicationForm component
  - [ ] Email input with validation
  - [ ] GitHub username input (optional)
  - [ ] Skills multi-select component
  - [ ] Bio textarea (max 500 chars)
  - [ ] Hourly rate number input
- [ ] 5.3 Build StakeFlow component
  - [ ] Display required stake amount (from contract)
  - [ ] "Approve USDC" button → approve() transaction
  - [ ] "Stake & Submit" button → stake() transaction + POST /developers
- [ ] 5.4 Implement signature flow
  - [ ] Generate message for signature
  - [ ] Request wallet signature via wagmi
  - [ ] Include signature in POST /developers request
- [ ] 5.5 Handle success/error states
  - [ ] Show loading during transactions
  - [ ] Display success message on completion
  - [ ] Redirect to /dashboard on success
  - [ ] Show error messages clearly

## 6. Frontend: Profile Page

- [ ] 6.1 Create /developers/[address] page
- [ ] 6.2 Build DeveloperProfile component
  - [ ] Profile header (avatar, wallet, verified badge)
  - [ ] Stats grid (stake, projects, reputation, on-time rate)
  - [ ] Skills tags display
  - [ ] Bio display
- [ ] 6.3 Build EditProfileModal component
  - [ ] Pre-fill current values
  - [ ] Same fields as application (except GitHub locked)
  - [ ] Availability toggle
  - [ ] Save button triggers PUT /developers/:address
- [ ] 6.4 Conditional rendering
  - [ ] Show edit button only for profile owner
  - [ ] Hide email for non-owner viewers

## 7. Testing & Validation

- [ ] 7.1 Write E2E test for complete onboarding flow
  - [ ] Connect wallet → Fill form → Approve → Stake → Verify profile created
- [ ] 7.2 Test GitHub uniqueness constraint
- [ ] 7.3 Test email uniqueness constraint
- [ ] 7.4 Test wallet signature verification
- [ ] 7.5 Test event sync (stake → account activation)
- [ ] 7.6 Run `tigs validate-specs --change add-developer-onboarding`
- [ ] 7.7 Fix any validation errors

## 8. Documentation

- [ ] 8.1 Document contract ABIs
- [ ] 8.2 Document API endpoints (OpenAPI/Swagger)
- [ ] 8.3 Write user guide for developer onboarding
- [ ] 8.4 Update README with new features

## 9. Deployment

- [ ] 9.1 Deploy StakeVault to Sepolia testnet
- [ ] 9.2 Deploy backend to staging environment
- [ ] 9.3 Deploy frontend to Vercel preview
- [ ] 9.4 QA testing in staging
- [ ] 9.5 Archive change: `tigs archive-change add-developer-onboarding`
- [ ] 9.6 Deploy to production
