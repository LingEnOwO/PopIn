import { createClient } from "@supabase/supabase-js";

interface SendPushRequest {
  type: "join" | "update" | "cancel";
  event_id: string;
  actor_id: string;
}

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
  console.log("[send-push] Expo API response:", JSON.stringify(result));
}

Deno.serve(async (req) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body: SendPushRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { type, event_id, actor_id } = body;

  if (!type || !event_id || !actor_id) {
    return new Response(
      JSON.stringify({ error: "Missing required fields: type, event_id, actor_id" }),
      { status: 400 },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch event details
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, title, host_id")
    .eq("id", event_id)
    .single();

  if (eventError || !event) {
    console.error("[send-push] Failed to fetch event:", eventError);
    return new Response(JSON.stringify({ error: "Event not found" }), { status: 404 });
  }

  // Fetch all event members with their push tokens
  const { data: members, error: membersError } = await supabase
    .from("event_members")
    .select("user_id, profiles(display_name, expo_push_token)")
    .eq("event_id", event_id);

  if (membersError) {
    console.error("[send-push] Failed to fetch members:", membersError);
    return new Response(JSON.stringify({ error: "Failed to fetch members" }), { status: 500 });
  }

  // Also fetch actor profile for join notifications (to include name in message)
  let actorName = "Someone";
  if (type === "join") {
    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", actor_id)
      .single();

    if (actorProfile) {
      actorName = actorProfile.display_name || actorProfile.email?.split("@")[0] || "Someone";
    }
  }

  // Determine recipients and notification content based on type
  let recipientIds: string[];
  let title: string;
  let notifBody: string;

  switch (type) {
    case "join":
      // Notify only the host (not the joiner)
      recipientIds = [event.host_id];
      title = "Someone joined your event 🎉";
      notifBody = `${actorName} joined ${event.title}`;
      break;

    case "update":
      // Notify all members except the actor (host who updated)
      recipientIds = (members || [])
        .map((m) => m.user_id)
        .filter((uid) => uid !== actor_id);
      title = "Event updated";
      notifBody = `${event.title} has new details`;
      break;

    case "cancel":
      // Notify all members except the actor (host who canceled)
      recipientIds = (members || [])
        .map((m) => m.user_id)
        .filter((uid) => uid !== actor_id);
      title = "Event canceled";
      notifBody = `${event.title} was canceled`;
      break;

    default:
      return new Response(JSON.stringify({ error: "Invalid type" }), { status: 400 });
  }

  if (recipientIds.length === 0) {
    console.log("[send-push] No recipients for type:", type);
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  // Build push token map from members (includes all members)
  const tokenMap = new Map<string, string>();
  for (const member of members || []) {
    const profile = member.profiles as { display_name: string | null; expo_push_token: string | null } | null;
    if (profile?.expo_push_token) {
      tokenMap.set(member.user_id, profile.expo_push_token);
    }
  }

  // For join notifications, also look up host token directly if host is not in members map
  if (type === "join" && !tokenMap.has(event.host_id)) {
    const { data: hostProfile } = await supabase
      .from("profiles")
      .select("expo_push_token")
      .eq("id", event.host_id)
      .single();
    if (hostProfile?.expo_push_token) {
      tokenMap.set(event.host_id, hostProfile.expo_push_token);
    }
  }

  // Build messages for recipients that have a push token
  const messages: ExpoMessage[] = [];
  for (const uid of recipientIds) {
    const token = tokenMap.get(uid);
    if (!token) {
      console.log(`[send-push] No push token for user ${uid}, skipping`);
      continue;
    }
    messages.push({
      to: token,
      title,
      body: notifBody,
      sound: "default",
      data: { event_id },
    });
  }

  if (messages.length === 0) {
    console.log("[send-push] No push tokens found for recipients");
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  try {
    await sendExpoPushNotifications(messages);
    console.log(`[send-push] Sent ${messages.length} notification(s) for type=${type}, event=${event_id}`);
  } catch (err) {
    console.error("[send-push] Failed to send notifications:", err);
    // Do not fail the response — notification errors must not crash main flow
  }

  return new Response(JSON.stringify({ sent: messages.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
