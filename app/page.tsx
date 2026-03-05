import Link from "next/link";
import { Container } from "@/components/ui/container";
import { IssueList } from "@/components/issues/issue-list";

export default function HomePage() {
  return (
    <Container className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <p className="text-sm font-medium text-blue-600">Mobile-First Civic Reporting</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Report city issues in minutes with CivicSync</h1>
        <p className="mt-3 text-sm text-slate-600 sm:text-base">
          Citizens can report potholes, garbage, and broken streetlights instantly, while authorities track and resolve them from a central dashboard.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/report" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Report Issue
          </Link>
          <Link href="/map" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            View Map
          </Link>
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Recent Issues</h2>
        <IssueList />
      </section>
    </Container>
  );
}