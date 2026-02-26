import { useState, useEffect } from "react";
import { View, Text, ScrollView, RefreshControl, Alert } from "react-native";
import { supabase } from "../../lib/supabase";
import type { EventWithDetails } from "shared";
import { EventCard } from "../../components/EventCard";

export default function MyEventsScreen() {
  const [hostingEvents, setHostingEvents] = useState<EventWithDetails[]>([]);
  const [joinedEvents, setJoinedEvents] = useState<EventWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  const fetchMyEvents = async () => {
    if (!userId) return;

    setLoading(true);

    // Fetch events I'm hosting
    const { data: hosting, error: hostingError } = await supabase
      .from("events")
      .select(
        `
        *,
        host:profiles!events_host_id_fkey(id, email, display_name),
        event_members(user_id)
      `,
      )
      .eq("host_id", userId)
      .eq("status", "active")
      .order("start_time", { ascending: true });

    if (hostingError) {
      Alert.alert("Error", "Failed to load hosting events");
      console.error(hostingError);
    } else {
      const hostingWithDetails: EventWithDetails[] = (hosting || []).map(
        (event: any) => ({
          ...event,
          host: event.host,
          attendee_count: event.event_members?.length || 0,
          is_joined: false,
        }),
      );
      setHostingEvents(hostingWithDetails);
    }

    // Fetch events I've joined
    const { data: memberData, error: memberError } = await supabase
      .from("event_members")
      .select(
        `
        event_id,
        events(
          *,
          host:profiles!events_host_id_fkey(id, email, display_name),
          event_members(user_id)
        )
      `,
      )
      .eq("user_id", userId);

    if (memberError) {
      Alert.alert("Error", "Failed to load joined events");
      console.error(memberError);
    } else {
      const joinedWithDetails: EventWithDetails[] = (memberData || [])
        .filter((m: any) => m.events && m.events.status === "active")
        .map((m: any) => ({
          ...m.events,
          host: m.events.host,
          attendee_count: m.events.event_members?.length || 0,
          is_joined: true,
        }))
        .sort(
          (a, b) =>
            new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
        );

      setJoinedEvents(joinedWithDetails);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (userId) {
      fetchMyEvents();
    }
  }, [userId]);

  return (
    <ScrollView
      className="flex-1 bg-osu-light"
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={fetchMyEvents}
          tintColor="#BB0000"
        />
      }
    >
      <View className="p-4">
        {/* Hosting Section */}
        <View className="mb-6">
          <Text className="text-xl font-bold text-osu-dark mb-4">
            Hosting ({hostingEvents.length})
          </Text>
          {hostingEvents.length === 0 ? (
            <View className="bg-white rounded-xl p-6 items-center">
              <Text className="text-gray-500">
                You're not hosting any events
              </Text>
              <Text className="text-gray-400 text-sm mt-1">
                Create one from the Create tab
              </Text>
            </View>
          ) : (
            hostingEvents.map((event) => (
              <View key={event.id} className="mb-4">
                <EventCard event={event} />
              </View>
            ))
          )}
        </View>

        {/* Joined Section */}
        <View>
          <Text className="text-xl font-bold text-osu-dark mb-4">
            Joined ({joinedEvents.length})
          </Text>
          {joinedEvents.length === 0 ? (
            <View className="bg-white rounded-xl p-6 items-center">
              <Text className="text-gray-500">
                You haven't joined any events
              </Text>
              <Text className="text-gray-400 text-sm mt-1">
                Browse events in the Feed
              </Text>
            </View>
          ) : (
            joinedEvents.map((event) => (
              <View key={event.id} className="mb-4">
                <EventCard event={event} />
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}
