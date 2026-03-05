import type { Comment } from "@/types/comment";

const comments: Comment[] = [
  {
    id: "c1",
    issueId: "1",
    userId: "authority-007",
    message: "Inspection scheduled for tomorrow morning.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "c2",
    issueId: "1",
    userId: "citizen-001",
    message: "Thank you. Traffic is heavy during rush hour here.",
    createdAt: new Date().toISOString(),
  },
];

export function CommentList() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900">Comments</h2>
      <div className="mt-4 space-y-3">
        {comments.map((comment) => (
          <article key={comment.id} className="rounded-md border border-slate-200 p-3">
            <p className="text-sm text-slate-700">{comment.message}</p>
            <p className="mt-2 text-xs text-slate-500">By {comment.userId}</p>
          </article>
        ))}
      </div>
    </section>
  );
}