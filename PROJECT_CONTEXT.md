# NagarWatch Project Context

## Project Overview
NagarWatch is a civic monitoring platform for citizens and authorities.

- Framework: Next.js 14 App Router
- Language: TypeScript
- Styling: Tailwind CSS
- Data + Realtime + Storage: Supabase
- Mapping: Mapbox GL JS

Authentication is intentionally deferred in this phase. Current flows support guest/citizen and authority interactions without strict login enforcement.

## Current Architecture

### Citizen Interface (Mobile-First)
- `app/page.tsx`: Landing and recent issue feed.
- `app/report/page.tsx`: Report creation with camera upload, GPS detection, and duplicate warning flow.
- `app/map/page.tsx` + `components/map/IssueMap.tsx`: Interactive city map with marker mode and heatmap mode.
- `app/issue/[id]/page.tsx` + `components/issues/issue-detail-view.tsx`: Detail page, upvotes, location preview, timeline, and comments.

### Authority Interface
- `app/admin/layout.tsx`
- `app/admin/dashboard/page.tsx`
- `app/admin/issues/page.tsx`
- `components/admin/admin-dashboard.tsx`: Status updates, escalation visibility, resolution proof upload, and analytics.

### Shared Libraries
- `lib/supabase.ts`: Typed Supabase client helpers.
- `lib/mapbox.ts`: Map token and default map center helpers.
- `lib/issue-events.ts`: Timeline event creation helper.
- `lib/admin-dashboard.ts`: Escalation rules, analytics transforms, and sorting.
- `lib/duplicate-detection.ts`: Geo + text similarity checks for duplicate issue warnings.

### Data Models
Typed in `types/database.ts` with key tables:
- `issues`
- `upvotes`
- `comments`
- `resolutions`
- `escalations`
- `issue_events`
- `departments`
- `users`

## Feature Coverage Snapshot

Implemented:
- Issue reporting with image upload to Supabase Storage (`issue-images` bucket)
- GPS detection in report flow
- Map markers and heatmap visualization
- Upvote system with realtime updates on detail page
- Comment system and timeline logging
- Authority dashboard with filtering/sorting and analytics charts
- Escalation logic (>7, >15, >30 days pending)
- Transparency timeline via `issue_events`
- Resolution proof upload (`resolution-proofs` bucket)
- Duplicate issue detection warning before report submit (new)

## Recent Development Update

### Duplicate Issue Detection Added
File: `app/report/page.tsx`

- Before report creation, unresolved nearby issues are queried from Supabase.
- Duplicate candidates are computed using:
  - Distance threshold (default 250m)
  - Text similarity (title + description token overlap)
  - Category-aware score
- Users are shown potential matching issues and can open them directly.
- Submission of a new issue requires explicit override acknowledgement when duplicates are detected.

Utility file:
- `lib/duplicate-detection.ts`

## Priority Next Steps

1. Add server-side duplicate guard.
- Current duplicate prevention is client-side UX.
- Add a Postgres function or API route check to avoid race conditions and enforce dedupe policy.

2. Add direct upload support for larger images.
- Use signed upload URLs and image compression/resizing pipeline for mobile performance.

3. Strengthen escalation workflow.
- Add assignment ownership fields and escalation acknowledgment actions by authorities.

4. Improve map analytics.
- Add category/status filter overlays in map mode and time-windowed hotspots.

5. Introduce auth and role-based access controls.
- Add Supabase Auth and RLS policies for citizen vs authority capabilities.

6. Add testing baseline.
- Unit tests for `lib/admin-dashboard.ts` and `lib/duplicate-detection.ts`.
- Integration tests for report flow and authority resolution flow.

## Operational Notes
- Required env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- Ensure storage buckets exist:
  - `issue-images`
  - `resolution-proofs`
- Realtime subscriptions are used for issues, upvotes, resolutions, escalations, and timeline events.
