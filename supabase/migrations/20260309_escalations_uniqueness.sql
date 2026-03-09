-- Ensures one escalation entry per issue per escalation level.

create unique index if not exists idx_escalations_issue_level_unique
on public.escalations(issue_id, escalation_level);
