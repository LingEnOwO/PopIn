import { createClient } from "@supabase/supabase-js";

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound?: "default";
  data?: Record<string, unknown>;
}

async function sendExpoPushNotifications(messages: ExpoMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  const result = await response.json();
  console.log("[event-reminders] Expo API response:", JSON.stringify(result));
}

Deno.serve(async (req) => {
  // Allow GET (for cron) or POST
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Find events starting in 12–18 minutes that haven't had a reminder sent
  const now = new Date();
  const windowStart = new Date(now.getTime() + 12 * 60 * 1000).toISOString();
  const windowEnd = new Date(now.getTime() + 18 * 60 * 1000).toISOString();

  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, title")
    .eq("status", "active")
    .gte("start_time", windowStart)
    .lte("start_time", windowEnd)
    .is("reminder_sent_at", null);

  if (eventsError) {
    console.error("[event-reminders] Failed to fetch events:", eventsError);
    return new Response(JSON.stringify({ error: "Failed to fetch events" }), { status: 500 });
  }

  if (!events || events.length === 0) {
    console.log("[event-reminders] No events need reminders right now");
    return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
  }

  console.log(`[event-reminders] Processing ${events.length} event(s) for reminders`);

  let totalSent = 0;

  for (const event of events) {
    // Fetch all members with their push tokens
    const { data: members, error: membersError } = await supabase
      .from("event_members")
      .select("user_id, profiles(expo_push_token)")
      .eq("event_id", event.id);

    if (membersError) {
      console.error(`[event-reminders] Failed to fetch members for event ${event.id}:`, membersError);
      continue;
    }

    // Build messages for members with a push token
    const messages: ExpoMessage[] = [];
    for (const member of members || []) {
      const profile = member.profiles as { expo_push_token: string | null } | null;
      if (!profile?.expo_push_token) continue;

      messages.push({
        to: profile.expo_push_token,
        title: "Starting soon ⏰",
        body: `${event.title} starts in 15 minutes`,
        sound: "default",
        data: { event_id: event.id },
      });
    }

    if (messages.length > 0) {
      try {
        await sendExpoPushNotifications(messages);
        totalSent += messages.length;
        console.log(`[event-reminders] Sent ${messages.length} reminder(s) for event ${event.id}`);
      } catch (err) {
        console.error(`[event-reminders] Failed to send reminders for event ${event.id}:`, err);
      }
    }

    // Mark reminder as sent regardless of notification success to avoid retrying
    const { error: updateError } = await supabase
      .from("events")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", event.id);

    if (updateError) {
      console.error(`[event-reminders] Failed to mark reminder_sent_at for event ${event.id}:`, updateError);
    }
  }

  return new Response(
    JSON.stringify({ processed: events.length, sent: totalSent }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
