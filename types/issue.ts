export type IssueStatus = "Open" | "In Progress" | "Resolved";

export type Issue = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: IssueStatus;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
  reportedBy: string;
};