// Database types
export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
}

export interface Event {
  id: string;
  host_id: string;
  title: string;
  start_time: string;
  end_time: string;
  location_text: string;
  capacity: number;
  description: string | null;
  status: "active" | "canceled";
  created_at: string;
}

export interface EventMember {
  event_id: string;
  user_id: string;
  joined_at: string;
}

export interface Feedback {
  id: string;
  user_id: string | null;
  message: string;
  screen: string | null;
  created_at: string;
}

// Extended types for UI
export interface EventWithDetails extends Event {
  host?: Profile;
  attendee_count?: number;
  is_joined?: boolean;
}

// Form types
export interface CreateEventInput {
  title: string;
  start_time: string;
  end_time: string;
  location_text: string;
  capacity: number;
  description?: string;
}

// Constants
export const OSU_COLORS = {
  scarlet: "#BB0000",
  dark: "#222222",
  light: "#F7F7F7",
  white: "#FFFFFF",
} as const;

export const EVENT_STATUS = {
  ACTIVE: "active",
  CANCELED: "canceled",
} as const;
