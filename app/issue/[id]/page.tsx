import { IssueDetailView } from "@/components/issues/issue-detail-view";

type IssueDetailsPageProps = {
  params: {
    id: string;
  };
};

export default function IssueDetailsPage({ params }: IssueDetailsPageProps) {
  return <IssueDetailView issueId={params.id} />;
}