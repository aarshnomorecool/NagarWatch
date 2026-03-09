export type UserRole = "citizen" | "authority" | "admin";
export type AuthorityLevel = "ward" | "zone" | "city" | "state";
export type IssueStatus = "pending" | "in_progress" | "resolved";
export type IssueEventType = "reported" | "upvote" | "downvote" | "priority" | "assigned" | "in_progress" | "resolved" | "comment" | "resolution_proof" | "reopened";
export type IssueEventActor = "citizen" | "authority" | "system";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          role: UserRole;
          authority_level: AuthorityLevel | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          role: UserRole;
          authority_level?: AuthorityLevel | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: UserRole;
          authority_level?: AuthorityLevel | null;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          role: UserRole;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: UserRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: UserRole;
          created_at?: string;
        };
        Relationships: [];
      };
      issues: {
        Row: {
          id: string;
          title: string;
          description: string;
          category: string;
          road_name: string | null;
          landmark: string | null;
          area_name: string | null;
          latitude: number;
          longitude: number;
          image_url: string | null;
          status: IssueStatus;
          created_by: string;
          created_at: string;
          upvote_count: number;
          downvote_count: number;
          is_priority: boolean;
          sla_target_hours: number;
          assigned_authority_level: AuthorityLevel;
          escalation_level: number;
          last_escalated_at: string | null;
          reopened_at: string | null;
          reopened_by: string | null;
          reopen_reason: string | null;
          reopen_proof: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          description: string;
          category: string;
          road_name?: string | null;
          landmark?: string | null;
          area_name?: string | null;
          latitude: number;
          longitude: number;
          image_url?: string | null;
          status?: IssueStatus;
          created_by: string;
          created_at?: string;
          upvote_count?: number;
          downvote_count?: number;
          is_priority?: boolean;
          sla_target_hours?: number;
          assigned_authority_level?: AuthorityLevel;
          escalation_level?: number;
          last_escalated_at?: string | null;
          reopened_at?: string | null;
          reopened_by?: string | null;
          reopen_reason?: string | null;
          reopen_proof?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string;
          category?: string;
          road_name?: string | null;
          landmark?: string | null;
          area_name?: string | null;
          latitude?: number;
          longitude?: number;
          image_url?: string | null;
          status?: IssueStatus;
          created_by?: string;
          created_at?: string;
          upvote_count?: number;
          downvote_count?: number;
          is_priority?: boolean;
          sla_target_hours?: number;
          assigned_authority_level?: AuthorityLevel;
          escalation_level?: number;
          last_escalated_at?: string | null;
          reopened_at?: string | null;
          reopened_by?: string | null;
          reopen_reason?: string | null;
          reopen_proof?: string | null;
        };
        Relationships: [];
      };
      upvotes: {
        Row: {
          id: string;
          issue_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          issue_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          issue_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          issue_id: string;
          user_id: string;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          issue_id: string;
          user_id: string;
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          issue_id?: string;
          user_id?: string;
          message?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      downvotes: {
        Row: {
          id: string;
          issue_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          issue_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          issue_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      departments: {
        Row: {
          id: string;
          name: string;
          resolution_rate: number;
        };
        Insert: {
          id?: string;
          name: string;
          resolution_rate?: number;
        };
        Update: {
          id?: string;
          name?: string;
          resolution_rate?: number;
        };
        Relationships: [];
      };
      resolutions: {
        Row: {
          id: string;
          issue_id: string;
          resolved_by: string;
          proof_image: string | null;
          resolution_note: string | null;
          resolved_at: string;
        };
        Insert: {
          id?: string;
          issue_id: string;
          resolved_by: string;
          proof_image?: string | null;
          resolution_note?: string | null;
          resolved_at?: string;
        };
        Update: {
          id?: string;
          issue_id?: string;
          resolved_by?: string;
          proof_image?: string | null;
          resolution_note?: string | null;
          resolved_at?: string;
        };
        Relationships: [];
      };
      escalations: {
        Row: {
          id: string;
          issue_id: string;
          escalation_level: number;
          escalated_to: string;
          escalated_to_level: AuthorityLevel;
          created_at: string;
        };
        Insert: {
          id?: string;
          issue_id: string;
          escalation_level: number;
          escalated_to: string;
          escalated_to_level: AuthorityLevel;
          created_at?: string;
        };
        Update: {
          id?: string;
          issue_id?: string;
          escalation_level?: number;
          escalated_to?: string;
          escalated_to_level?: AuthorityLevel;
          created_at?: string;
        };
        Relationships: [];
      };
      issue_events: {
        Row: {
          id: string;
          issue_id: string;
          event_type: IssueEventType;
          message: string;
          created_by: IssueEventActor;
          created_at: string;
        };
        Insert: {
          id?: string;
          issue_id: string;
          event_type: IssueEventType;
          message: string;
          created_by: IssueEventActor;
          created_at?: string;
        };
        Update: {
          id?: string;
          issue_id?: string;
          event_type?: IssueEventType;
          message?: string;
          created_by?: IssueEventActor;
          created_at?: string;
        };
        Relationships: [];
      };
      issue_follows: {
        Row: {
          id: string;
          issue_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          issue_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          issue_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          issue_id: string | null;
          notification_type: string;
          title: string;
          body: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          issue_id?: string | null;
          notification_type: string;
          title: string;
          body: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          issue_id?: string | null;
          notification_type?: string;
          title?: string;
          body?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type DbUser = Database["public"]["Tables"]["users"]["Row"];
export type DbProfile = Database["public"]["Tables"]["profiles"]["Row"];
export type DbIssue = Database["public"]["Tables"]["issues"]["Row"];
export type DbUpvote = Database["public"]["Tables"]["upvotes"]["Row"];
export type DbComment = Database["public"]["Tables"]["comments"]["Row"];
export type DbDownvote = Database["public"]["Tables"]["downvotes"]["Row"];
export type DbDepartment = Database["public"]["Tables"]["departments"]["Row"];
export type DbResolution = Database["public"]["Tables"]["resolutions"]["Row"];
export type DbEscalation = Database["public"]["Tables"]["escalations"]["Row"];
export type DbIssueEvent = Database["public"]["Tables"]["issue_events"]["Row"];
export type DbIssueFollow = Database["public"]["Tables"]["issue_follows"]["Row"];
export type DbNotification = Database["public"]["Tables"]["notifications"]["Row"];