// Database types
export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  major: string | null;
  year: number | null;
  interest_tags: string[];
  avatar_url: string | null;
  hosted_count: number;
  attendance_rate: number;
}

export interface Event {
  id: string;
  host_id: string;
  title: string;
  start_time: string;
  end_time: string;
  location_text: string;
  location_lat: number | null;
  location_lng: number | null;
  capacity: number | null;
  description: string | null;
  tags: EventTag[];
  image_url: string | null;
  source_url: string | null;
  status: "active" | "canceled";
  created_at: string;
}

export const EVENT_TAGS = [
  "social",
  "professional",
  "academic",
  "cultural",
  "performance",
  "movie",
  "sports",
  "fitness",
  "gaming",
  "volunteering",
  "religious",
  "political",
  "music",
  "art",
  "tech",
  "business",
  "health",
  "career",
  "study",
  "free_food",
  "free_merch",
  "networking",
  "hiring",
  "beginner_friendly",
  "outdoor",
  "online",
  "drop_in",
] as const;

export type EventTag = (typeof EVENT_TAGS)[number];

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
export interface EventParticipant {
  user_id: string;
  profile: Pick<Profile, "id" | "email" | "display_name" | "avatar_url"> | null;
}

export interface EventWithDetails extends Event {
  host?: Profile;
  attendee_count?: number;
  is_joined?: boolean;
  participants?: EventParticipant[];
}

// Form types
export interface CreateEventInput {
  title: string;
  start_time: string;
  end_time: string;
  location_text: string;
  capacity?: number | null;
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
