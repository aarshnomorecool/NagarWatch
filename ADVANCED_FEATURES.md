# NagarWatch Advanced Features Implementation Guide

## Overview

This document describes the 8 advanced civic features implemented in NagarWatch to enhance transparency, accountability, and civic participation.

---

## 1. Citizen Verification System (Crowd Verified Resolution)

### Purpose

Enable citizens to verify whether authority resolutions are actually effective, creating a community-driven accountability mechanism.

### How It Works

1. **Authority Resolution Submission**
   - Authority marks issue as "Resolved"
   - Uploads resolution note and before/after images
   - System sends verification requests to nearby citizens

2. **Citizen Verification**
   - Resolved issues show verification UI
   - Citizens can vote: "Fully Fixed", "Partially Fixed", "Not Fixed"
   - Optional notes can be added for feedback

3. **Auto-Reopen Mechanism**
   - If 3+ citizens select "Not Fixed":
     - Issue automatically reverts to "Pending" status
     - Returns to responsible authority
     - Escalation timer resets
   - Creates accountability loop for governance

### Database Tables

- `issue_verifications` - Tracks citizen verification votes
- `issues` - Enhanced with `reopened_at`, `reopened_by`, `reopen_reason`, `reopen_proof`

### UI Location

- [components/issues/issue-detail-view.tsx](../components/issues/issue-detail-view.tsx) - Verification UI for citizens

---

## 2. Civic Participation Leaderboard

### Purpose

Gamify civic participation to encourage responsible reporting, voting, and verification.

### Points System

- **Reporting verified issue**: +10 points
- **Upvoting useful report**: +2 points
- **Verification participation**: +3 points

### Features

- **Top Contributors Display**: Shows top 10 citizens ranked by points
- **Personal Rank**: Citizens can see their individual rank and points
- **Point Tracking**: Full transaction history for auditing

### Database Tables

- `citizen_scores` - Aggregate points and participation metrics
- `citizen_point_transactions` - Transaction log for point awards

### UI Components

- [components/civic/leaderboard-panel.tsx](../components/civic/leaderboard-panel.tsx) - Main leaderboard display
- Integrated into [app/(citizen)/citizen/dashboard/page.tsx](<../app/(citizen)/citizen/dashboard/page.tsx>)

### Helper Functions

- [lib/citizen-leaderboard.ts](../lib/citizen-leaderboard.ts):
  - `awardCitizenPoints()` - Award points for actions
  - `getCitizenLeaderboard()` - Get top contributors
  - `getCitizenRank()` - Get individual citizen rank
  - `getTopContributors()` - Get top X by various metrics

---

## 3. Civic Emergency Broadcast System

### Purpose

Enable authorities to send location-based emergency alerts to nearby citizens for public safety.

### Features

- **Alert Creation**: Authorities specify:
  - Alert title (e.g., "Road Collapse Warning")
  - Description/message
  - Location coordinates
  - Broadcast radius (km)

- **Citizen Notifications**: Citizens see alerts if within radius
- **Real-time Updates**: Alerts appear instantly via Supabase subscriptions

### Example Alerts

- Road collapse warning
- Flood alert
- Infrastructure hazard
- Emergency road closure
- Water/Power supply disruption

### Database Tables

- `alerts` - Active emergency broadcasts

### UI Components

- [components/admin/civic-alerts-panel.tsx](../components/admin/civic-alerts-panel.tsx) - Authority alert creation and citizen view
- Integrated into [app/(citizen)/citizen/dashboard/page.tsx](<../app/(citizen)/citizen/dashboard/page.tsx>)

---

## 4. Department Performance Score

### Purpose

Provide transparent performance metrics for administrative departments.

### Metrics Calculated

Each department receives a score (0-100) based on:

- **Resolution Rate** (50% weight): % of issues resolved vs total
- **Response Time** (30% weight): Average days to resolve
- **Escalation Penalty** (20% weight): Number of escalations

### Formula

```
Score = (resolution_rate * 0.5)
      + (response_speed_score * 0.3)
      - (escalation_penalty * 0.2)
```

### Features

- **Real-time Calculation**: Updates as issues are resolved
- **Visual Dashboard**: Bar chart showing department resolution rates
- **Flagged Departments**: Departments below 50% resolution flagged in red
- **Detailed Breakdown**: Shows resolution rate, avg resolution time, escalation count

### Implementation

- [lib/admin-dashboard.ts](../lib/admin-dashboard.ts) - `computeDepartmentScores()` function
- UI in [components/admin/admin-dashboard.tsx](../components/admin/admin-dashboard.tsx)

---

## 5. Predictive Infrastructure Risk Detection

### Purpose

Identify and flag high-risk infrastructure zones based on complaint patterns to enable proactive maintenance.

### How It Works

1. **Pattern Analysis**
   - Monitors all citizen reports by category and location
   - Groups complaints within specified radius (default 500m)
   - Triggers on configurable thresholds:
     - Pothole: 8+ reports → "Road Infrastructure Risk"
     - Open Drain: 5+ reports → "Drainage Risk"
     - Electrical Wire: 3+ reports → "Electrical Hazard Risk"
     - Road Collapse: 3+ reports → "Critical Road Risk"

2. **Risk Zone Creation**
   - Detected zones receive risk level: Low/Medium/High/Critical
   - Centroid calculated from clustered complaints
   - Tracks issue count and last report timestamp

3. **Authority Benefits**
   - Identify deterioration hotspots
   - Plan preventive maintenance
   - Allocate resources efficiently
   - Demonstrate infrastructure risk patterns to public

### Database Tables

- `infrastructure_risk_zones` - Detected risk zones
- `risk_zone_thresholds` - Configuration for risk detection

### UI Components

- [components/civic/infrastructure-risk-panel.tsx](../components/civic/infrastructure-risk-panel.tsx) - Risk zone display
- Integrated into [app/(citizen)/citizen/dashboard/page.tsx](<../app/(citizen)/citizen/dashboard/page.tsx>)

### Helper Functions

- [lib/infrastructure-risk.ts](../lib/infrastructure-risk.ts):
  - `detectInfrastructureRisks()` - Detect risk zones from issues
  - `getRiskZonesNear()` - Get risks near coordinates
  - `getHighRiskZones()` - Get critical/high risk zones

---

## 6. Civic Blackbox Timeline (Issue Lifecycle)

### Purpose

Provide complete transparency into issue resolution process with full audit trail.

### Timeline Events Recorded

- `reported` - Issue created by citizen
- `assigned` - Authority assignment (if applicable)
- `in_progress` - Authority started work
- `upvote` / `downvote` - Public voting
- `priority` - System auto-prioritized (critical hazard)
- `resolved` - Authority marked resolved
- `resolution_proof` - Proof images uploaded
- `comment` - Comments added
- `reopened` - Issue re-opened (by citizen or system)
- `verification` - Citizen verification (fully_fixed, partially_fixed, not_fixed)
- Escalation events (ward→zone→city→state)

### Features

- **Transparent Process**: Every action recorded with timestamp and actor
- **Governance Audit Trail**: Complete history for public review
- **Issue Lifecycle Visualization**: Progress bar showing current stage
- **Timestamp Tracking**: Exact times for SLA calculations

### Database Tables

- `issue_events` - Detailed event log per issue

### UI Location

- [components/issues/issue-detail-view.tsx](../components/issues/issue-detail-view.tsx) - "Issue Progress" section shows lifecycle

---

## 7. Resolution Proof System

### Purpose

Ensure transparency by requiring authorities to provide documented evidence of issue resolution.

### Required Fields

- **Resolution Note**: Text description of work performed
- **After Image**: Photo showing issue resolved
- **Optional Before Image**: Reference to original issue image

### Storage

- Images stored in Supabase Storage bucket: `resolution-proofs`
- Metadata stored in `resolutions` table

### Features

- **Mandatory Upload**: Cannot mark resolved without proof
- **Public Display**: Citizens see proof images when issue resolved
- **Audit Trail**: Resolution date and responsible authority tracked
- **Re-opening Support**: Citizens can cite proof quality when requesting re-open

### Database Tables

- `resolutions` - Resolution records with proof_image and resolution_note

### UI Components

- Authority submission: [components/admin/admin-dashboard.tsx](../components/admin/admin-dashboard.tsx) - Authority Actions section
- Citizen view: [components/issues/issue-detail-view.tsx](../components/issues/issue-detail-view.tsx) - Resolution Proof section

---

## 8. Critical Hazard Detection

### Purpose

Auto-prioritize dangerous issues to ensure rapid response for public safety.

### Critical Hazard Categories

- `open_drain` - Open/uncovered drainage
- `electric_wire` - Exposed electrical wires
- `road_collapse` - Road structure failure
- `major_pothole` - Large dangerous potholes

### Auto-prioritization Actions

When critical hazard reported:

1. ✅ Issue marked as `is_priority = true`
2. ✅ Escalation level set to 1 (skips ward level)
3. ✅ Assigned directly to Zone Authority
4. ✅ System event created: "Critical hazard auto-prioritized"
5. ✅ Included in higher authority dashboard immediately

### Implementation

- [app/report/page.tsx](../app/report/page.tsx) - Lines with `CRITICAL_HAZARD_CATEGORIES`
- Integr in reporting flow to automatically escalate

---

## Integration Points

### Civic Integration Module

[lib/civic-integration.ts](../lib/civic-integration.ts) provides integration functions:

```typescript
// Called when issue reported
handleIssueReported(supabase, issue, userId, username)
  → Awards reporting points
  → Triggers risk zone detection

// Called when issue upvoted
handleIssueUpvoted(supabase, issueId, userId, username)
  → Awards upvote points

// Called when verification submitted
handleVerificationSubmitted(supabase, issueId, userId, verdict, username)
  → Awards verification points
  → Checks for auto-reopen threshold

// Batch infrastructure risk detection
runInfrastructureRiskDetection(supabase)
  → Scans all issues
  → Creates/updates risk zones
```

### Data Flow

```
Citizen Reports Issue
├─ handleIssueReported() called
├─ Points awarded (+10)
├─ Risk zones recalculated
└─ Critical hazards auto-escalated

Citizen Upvotes
├─ handleIssueUpvoted() called
└─ Points awarded (+2)

Issue Resolved
├─ Resolution proof submitted
├─ Citizens notified
└─ Ready for verification

Citizen Verifies
├─ handleVerificationSubmitted() called
├─ Points awarded (+3)
├─ If 3+ "Not Fixed": Issue auto-reopened
└─ Authority re-assigned

Authority Resolution Excellence
└─ Reflected in Department Performance Score
```

---

## Database Migrations

New migrations created:

- `20260311_citizen_scores_leaderboard.sql` - Leaderboard tables
- `20260311_infrastructure_risk_zones.sql` - Risk detection tables

Existing migrations used:

- `20260310_citizen_verification_layer.sql` - Verification system
- `20260310_civic_alerts.sql` - Emergency alerts

---

## Configuration

### Risk Zone Thresholds

Edit `infrastructure_risk_zones.sql` to configure detection thresholds:

```sql
('pothole', 8, 500, 'road_hazard', 'high'),
('road_collapse', 3, 500, 'road_hazard', 'critical'),
('open_drain', 5, 500, 'drainage', 'high'),
...
```

### Point Values

Edit `citizen-leaderboard.ts` to adjust points:

```typescript
const POINT_VALUES = {
  reported_issue: 10,
  upvote: 2,
  verification: 3,
  report_verified: 10,
};
```

### Verification Reopen Threshold

Currently 3 "Not Fixed" votes in [components/issues/issue-detail-view.tsx](../components/issues/issue-detail-view.tsx):

```typescript
const VERIFICATION_REOPEN_THRESHOLD = 3;
```

---

## Metrics & Analytics

The platform now provides:

- **Civic Engagement**: Citizen points and leaderboard trends
- **Infrastructure Health**: Risk zone distribution and severity
- **Department Accountability**: Performance scores and escalation rates
- **Issue Resolution**: Timeline data for SLA compliance
- **Public Trust**: Verification system transparency metrics

---

## Future Enhancements

Potential improvements:

1. **Notification System**: Alert citizens of nearby risk zones
2. **Predictive Models**: ML-based risk forecasting
3. **Department Benchmarking**: Compare across agencies/regions
4. **Gamification**: Badges/achievements for civic contributors
5. **Mobile App**: Native citizen/authority apps
6. **API**: Public API for third-party analytics
7. **Seasonal Analytics**: Infrastructure degradation patterns by climate
8. **Social Proof**: Citizen ratings for authority work quality

---

## Testing Checklist

- [ ] Report critical hazard issue
- [ ] Verify automatic escalation to zone
- [ ] Upvote issue and confirm point award
- [ ] Submit resolution with proof images
- [ ] Verify resolution as citizen (fully_fixed)
- [ ] Check leaderboard ranking updated
- [ ] Verify "Not Fixed" votes trigger auto-reopen at threshold
- [ ] Check infrastructure risk zones detected for clustered complaints
- [ ] View department performance scores
- [ ] Confirm civic alerts display near citizens
- [ ] Review issue timeline shows all events
- [ ] Authority completes resolution and checks department score update

---

## Support & Questions

For implementation details, refer to:

- Database: [supabase/migrations/](../supabase/migrations/)
- Types: [types/database.ts](../types/database.ts)
- Libraries: [lib/](../lib/)
- Components: [components/](../components/)
