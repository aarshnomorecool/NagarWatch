export type UserRole = "citizen" | "authority" | "admin";

export type User = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  createdAt: string;
};