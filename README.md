# CivicSync

CivicSync is a civic monitoring platform built with:

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (`@supabase/supabase-js`)
- Mapbox GL JS
- Recharts

## Run locally

```bash
npm install
npm run dev
```

## Environment variables

Create a `.env.local` file in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_public_token
```

## Project structure

```text
app/
	page.tsx
	map/page.tsx
	report/page.tsx
	issue/[id]/page.tsx
	admin/layout.tsx
	admin/dashboard/page.tsx
	admin/issues/page.tsx
components/
	map/
	issues/
	comments/
	admin/
	ui/
lib/
	supabase.ts
	mapbox.ts
	utils.ts
types/
	issue.ts
	user.ts
	comment.ts
```
