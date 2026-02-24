import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from "react-native";
import { supabase } from "../../lib/supabase";
import type { EventWithDetails } from "shared";
import { EventCard } from "../../components/EventCard";
import { getPostHog, buildEventProps } from "../../lib/posthog";

// Session-level dedup: an event is counted as viewed only once per session
const viewedEventIds = new Set<string>();

type FilterType = "all" | "next3hours" | "today";

export default function FeedScreen() {
  const [events, setEvents] = useState<EventWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [userId, setUserId] = useState<string | null>(null);

  // Fire event_viewed only when ≥50% of the card is visible for ≥500 ms
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 500,
  });

  const onViewableItemsChanged = useCallback(
    ({
      viewableItems,
    }: {
      viewableItems: Array<{ item: EventWithDetails }>;
    }) => {
      viewableItems.forEach(({ item }) => {
        if (!viewedEventIds.has(item.id)) {
          viewedEventIds.add(item.id);
          getPostHog().capture("event_viewed", buildEventProps(item));
        }
      });
    },
    [],
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("events")
      .select(
        `
        *,
        host:profiles!events_host_id_fkey(id, email, display_name),
        event_members(user_id)
      `,
      )
      .eq("status", "active")
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true });

    const now = new Date();

    if (filter === "next3hours") {
      const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      query = query.lte("start_time", threeHoursLater.toISOString());
    } else if (filter === "today") {
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte("start_time", endOfDay.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      Alert.alert("Error", "Failed to load events");
      console.error(error);
    } else {
      const eventsWithDetails: EventWithDetails[] = (data || []).map(
        (event: any) => ({
          ...event,
          host: event.host,
          attendee_count: event.event_members?.length || 0,
          is_joined: userId
            ? event.event_members?.some((m: any) => m.user_id === userId)
            : false,
        }),
      );
      setEvents(eventsWithDetails);
    }

    setLoading(false);
  }, [filter, userId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <View className="flex-1 bg-osu-light">
      <View className="bg-white px-4 py-3 border-b border-gray-200">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-row"
        >
          <TouchableOpacity
            onPress={() => setFilter("all")}
            className={`mr-2 px-4 py-2 rounded-lg ${
              filter === "all" ? "bg-osu-scarlet" : "bg-gray-100"
            }`}
          >
            <Text
              className={`font-semibold ${filter === "all" ? "text-white" : "text-osu-dark"}`}
            >
              All Events
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilter("next3hours")}
            className={`mr-2 px-4 py-2 rounded-lg ${
              filter === "next3hours" ? "bg-osu-scarlet" : "bg-gray-100"
            }`}
          >
            <Text
              className={`font-semibold ${filter === "next3hours" ? "text-white" : "text-osu-dark"}`}
            >
              Next 3 Hours
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilter("today")}
            className={`mr-2 px-4 py-2 rounded-lg ${
              filter === "today" ? "bg-osu-scarlet" : "bg-gray-100"
            }`}
          >
            <Text
              className={`font-semibold ${filter === "today" ? "text-white" : "text-osu-dark"}`}
            >
              Today
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSignOut}
            className="px-4 py-2 rounded-lg bg-gray-100"
          >
            <Text className="font-semibold text-osu-dark">Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <FlatList
        className="flex-1 px-4"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 16 }}
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <EventCard event={item} />}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig.current}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchEvents}
            tintColor="#BB0000"
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View className="items-center justify-center py-12">
              <Text className="text-gray-500 text-lg">No events found</Text>
              <Text className="text-gray-400 mt-2">Try a different filter</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}
