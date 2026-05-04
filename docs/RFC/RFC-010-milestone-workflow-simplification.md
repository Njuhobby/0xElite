# RFC-010: Milestone Workflow Simplification

| Field    | Value                                          |
|----------|------------------------------------------------|
| RFC      | 010                                            |
| Title    | Milestone Workflow Simplification              |
| Author   | 0xElite Team                                   |
| Status   | Accepted                                       |
| Created  | 2026-05-04                                     |
| Updated  | 2026-05-04                                     |

---

## 1. Context

After RFC-008 moved milestone state on-chain, the dev/client interaction surface around a single milestone consisted of:

1. Dev clicks "Start Working on This Milestone" — flips DB row from `pending` → `in_progress`.
2. Dev does the work, clicks "Submit Deliverables" — opens a form that captures one or more URLs (GitHub PR, Figma link, etc.) and a status message, posts to backend, flips row to `pending_review`.
3. Backend creates a `milestone_submitted` notification for the client and shows the deliverables on the project page.
4. Client clicks Approve (or Reject, with notes) — `pending_review` → `completed` (via on-chain `approveMilestone`) or back to `pending` (with feedback notes).
5. Client/dev can also raise a dispute, etc.

This was inherited from a much earlier prototype where the milestone object was supposed to be the dev/client communication channel.

---

## 2. Problem Statement

Three distinct issues with this UI:

- **"Start Working" is meaningless friction.** The dev was assigned this milestone the moment the project was deposited; they don't need to formally announce starting. The button only existed to fill the `in_progress` enum slot in the state machine. User feedback: *"我感觉developers根本不需要'开始这个milestone'这一操作，这没有意义"*.
- **The deliverable URL form is the wrong shape.** Real deliverables look like "the work is in this PR, I made the following test cases, here's a Loom walkthrough". Cramming that into one or two URL fields plus a status message gives both sides a worse UX than just talking. User feedback: *"不需要url表单，告知client完成即可，剩下来的具体关于'在哪里可以review工作'之类的，我将在之后的一个更为宏大的模块中处理"*.
- **The word "Submit" is wrong.** The dev isn't *submitting* anything in any contractual sense — they're notifying the client that the work is ready for review. The actual artifact transfer happens via whatever channel the two parties agreed on. User feedback: *"submit这个词其实也不好，developer其实不需要submit任何东西，他只要告知即可"*.

Beyond the immediate UI question, two latent bugs in the same area:

- **Project never auto-completed**. `projects.status` only flipped to `completed` via dispute resolution; the happy-path `approveMilestone` flow updated milestone rows but left the project at `active`. Reviews UI was gated on `status='completed'`, so post-project reviews never opened, and `voting_power` (derived from earnings × rating) never accrued.
- **Dev → client review UI is dead weight for MVP**. We had a Submit Review button on the dev's project detail page, but no consumer for those reviews — clients don't get reputation in this iteration. It existed only to mirror the client → dev flow.

---

## 3. Options Considered

### 3.1 Milestone state machine

**Option A**: Keep `pending → in_progress → pending_review → completed`, just relabel the button "Notify Client" instead of "Submit".

- **Pros**: Smallest patch.
- **Cons**: Doesn't address the fundamental problem that `in_progress` carries no meaning we exploit.

**Option B**: Drop the `in_progress` step entirely. `pending → pending_review → completed`.

- **Pros**: Removes a step that exists only to satisfy the enum. Word "submit" can also go.
- **Cons**: `MilestoneStatus.InProgress` still exists on chain; we need to make sure no on-chain path requires that intermediate state. (Verified: `approveMilestone` requires `PendingReview`, not anything specific about how it got there.)

**Option C**: Drop the "notify" step too — let the client poll. Dev marks "ready" out of band; client just checks the project page and approves when satisfied.

- **Pros**: Even fewer clicks.
- **Cons**: No notification means client has to remember to check. Dev has no way to push the conversation forward.

### 3.2 Deliverable artifacts

**Option D**: Keep the URL form, polish the UX.

- **Pros**: Self-contained, doesn't depend on a future module.
- **Cons**: Still cramming complex artifacts into a structured field. Both sides end up writing freeform context elsewhere anyway.

**Option E**: Drop the URL form entirely. The "where is the work" conversation lives in a future client/dev communication module (chat / negotiation / deliverable sharing — see `project_comms_module_planned`).

- **Pros**: Doesn't lock us into a half-baked artifact model. The future module can do this right.
- **Cons**: Until that module ships, the only signal is the status transition. Acceptable — the parties have email/Slack/wherever they already coordinate.

### 3.3 Project completion

**Option F**: Continue gating completion on the existing chain-driven path (only via dispute resolution today).

- **Pros**: Simple.
- **Cons**: Happy-path projects never reach `completed`. Reviews stay locked. `projects_completed` counter stays 0.

**Option G**: Auto-complete the project when the last milestone is approved on-chain.

- **Pros**: Matches user mental model ("all milestones done = project done"). No new contract code — the chain already emits `MilestoneApproved`; we derive completion off-chain when the count of remaining non-completed milestones hits zero. Triggers reviews, voting_power accrual, dashboard counters.
- **Cons**: Project completion is now an emergent state derived in `handleApproveMilestone`, not an explicit chain transition. Acceptable because nothing on-chain depends on it (escrow is already empty by then; payments happened atomically per milestone).

### 3.4 Dev → client review

**Option H**: Keep dev-side Submit Review for symmetry.

- **Pros**: Symmetry.
- **Cons**: Nothing reads it. It's a feature-shaped UI element with no downstream effect.

**Option I**: Cut dev → client review. Only client → dev reviews are wired (they drive `voting_power` via DB trigger).

- **Pros**: One less thing to maintain. Symmetry can come back when client reputation is a real feature.
- **Cons**: Asymmetric UX. Defensible because client doesn't need a reputation surface in this iteration.

---

## 4. Decision

Adopt **B + E + G + I**:

- Drop `in_progress` from the dev's UI flow. Single button: "Mark as Complete" (transition `pending → pending_review`).
- Drop the deliverable URL form. Notifying-only — the dev's intent is "I think I'm done, please review". Real deliverables live in the future communications module.
- Auto-complete the project in `handleApproveMilestone` when the count of non-completed milestones reaches zero. Bump `developers.projects_completed`, `developers.availability='available'`, `clients.projects_completed`, `clients.total_spent`.
- Cut the dev → client Submit Review button entirely. Reviews API on the dev page is read-only (so the dev can see what the client wrote about them, when they do).

The button label is **"Mark as Complete"**, not "Submit". The notification it generates is **"Milestone Submitted for Review"** addressed to the client (passive voice acknowledges this is the client-facing framing — the dev didn't "submit" anything to the platform, but for the client this is a thing that arrived in their queue).

The on-chain milestone status enum (`Pending`, `InProgress`, `PendingReview`, `Completed`, `Disputed`) is unchanged — `InProgress` simply has no UI path leading into it. Owner can still move milestones into it via `updateMilestoneStatus` for ops/recovery; nothing in the happy path uses it.

---

## 5. Consequences

### 5.1 What changed in code

- **Frontend** (`MilestoneCard.tsx`): collapsed dev path to a single button, dropped the deliverable URLs block, dropped the dev's review submit button on `developer/projects/[id]/page.tsx`. Status labels: `pending` → "Open", `pending_review` → "Awaiting Approval".
- **Backend** (`pendingTxActions.handleApproveMilestone`): added the auto-completion logic — if remaining count is zero, flip `projects.status='completed'`, bump dev/client counters, fire `project_completed` notification (in `postCommit`).
- **Backend** (`pendingTxActions.handleApproveMilestone`): also fires `milestone_paid` notification to the dev with the actual USDC amount released — this was missing entirely before.
- **Backend** (`PUT /api/milestones/:id`): the entire route file was deleted. Dev's "Mark as Complete" goes through wagmi → `update_milestone_status` action (see RFC-009). Client's approve was already on-chain. There's no remaining caller.

### 5.2 What stays the same

- Milestone budgets, hashes, on-chain index — unchanged.
- Client's `approveMilestone` flow — unchanged (it was already on-chain wagmi).
- Dispute path — unchanged here, see RFC-011 for the dispute resolution bookkeeping.

### 5.3 Review semantics

- Client → dev review is the only direction that exists. It updates `developers.average_rating`, which fires the `recalculate_voting_power` trigger.
- Reviews UI on both client and dev pages is gated on `project.status === 'completed'`. With Option G, that finally happens on the happy path.
- Dev-resolved-via-dispute projects have no review step today (no party has the mandate to rate the other under contested terms), so `average_rating` stays NULL and `voting_power` stays 0 even though `total_earned > 0`. See RFC-011 §7 for the open question.

---

## 6. Open Questions

- **What happens to `MilestoneStatus.InProgress` on chain?** Today: nothing reads it on the happy path; owner can still write it via `updateMilestoneStatus`. We can leave it as a vestigial enum value or reduce the enum on a future contract upgrade. Defer.
- **How does the comms module hand off to milestones?** When the chat/deliverable module ships, the milestone notification likely becomes a system message in the milestone's thread, not a separate notification. Out of scope here.
- **Dev-resolved-via-dispute developers earn but get 0 voting_power.** See RFC-011.

---

## 7. References

- Implementation: `frontend/src/components/project/MilestoneCard.tsx`, `backend/src/services/pendingTxActions.ts:handleApproveMilestone`
- Memory: `feedback_no_state_machine_features.md`, `project_comms_module_planned.md`
- Related: RFC-008 (on-chain milestones), RFC-009 (tx orchestration)
