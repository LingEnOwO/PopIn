import { useState, useEffect } from "react";
import { View, Text, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../../../lib/supabase";
import type { EventWithDetails } from "shared";
import { Card } from "../../../components/Card";
import { PrimaryButton, SecondaryButton } from "../../../components/Button";

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  const [event, setEvent] = useState<EventWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  const fetchEvent = async () => {
    setLoading(true);

    const { data, error } = (await supabase
      .from("events")
      .select(
        `
        *,
        host:profiles!events_host_id_fkey(id, email, display_name),
        event_members(user_id)
      `,
      )
      .eq("id", id)
      .single()) as any;

    if (error) {
      Alert.alert("Error", "Failed to load event");
      console.error(error);
      router.back();
    } else {
      const eventWithDetails: EventWithDetails = {
        ...data,
        host: data.host,
        attendee_count: data.event_members?.length || 0,
        is_joined: userId
          ? data.event_members?.some((m: any) => m.user_id === userId)
          : false,
      };
      setEvent(eventWithDetails);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (id && userId) {
      fetchEvent();
    }
  }, [id, userId]);

  const handleJoin = async () => {
    if (!event || !userId) return;

    if (event.attendee_count! >= event.capacity) {
      Alert.alert("Event Full", "This event has reached its capacity");
      return;
    }

    setActionLoading(true);

    // @ts-expect-error - Supabase type inference issue
    const { error } = await supabase.from("event_members").insert({
      event_id: event.id,
      user_id: userId,
    });

    setActionLoading(false);

    if (error) {
      if (error.code === "23505") {
        Alert.alert("Already Joined", "You have already joined this event");
      } else {
        Alert.alert("Error", "Failed to join event");
        console.error(error);
      }
    } else {
      Alert.alert("Success", "You have joined the event!");
      fetchEvent();
    }
  };

  const handleLeave = async () => {
    if (!event || !userId) return;

    setActionLoading(true);

    const { error } = await supabase
      .from("event_members")
      .delete()
      .eq("event_id", event.id)
      .eq("user_id", userId);

    setActionLoading(false);

    if (error) {
      Alert.alert("Error", "Failed to leave event");
      console.error(error);
    } else {
      Alert.alert("Success", "You have left the event");
      fetchEvent();
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-osu-light items-center justify-center">
        <ActivityIndicator size="large" color="#BB0000" />
      </View>
    );
  }

  if (!event) {
    return (
      <View className="flex-1 bg-osu-light items-center justify-center">
        <Text className="text-gray-500">Event not found</Text>
      </View>
    );
  }

  const startDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);

  const formatDateTime = (date: Date) => {
    return date.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const isFull = event.attendee_count! >= event.capacity;
  const isHost = userId === event.host_id;

  return (
    <ScrollView className="flex-1 bg-osu-light">
      <View className="p-4">
        <Card>
          <View className="mb-4">
            <Text className="text-2xl font-bold text-osu-dark mb-2">
              {event.title}
            </Text>
            {isFull && (
              <View className="bg-osu-scarlet px-3 py-1 rounded self-start">
                <Text className="text-white font-semibold">FULL</Text>
              </View>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-gray-600 font-semibold mb-1">📅 When</Text>
            <Text className="text-osu-dark">
              Starts: {formatDateTime(startDate)}
            </Text>
            <Text className="text-osu-dark">
              Ends: {formatDateTime(endDate)}
            </Text>
          </View>

          <View className="mb-4">
            <Text className="text-gray-600 font-semibold mb-1">📍 Where</Text>
            <Text className="text-osu-dark">{event.location_text}</Text>
          </View>

          <View className="mb-4">
            <Text className="text-gray-600 font-semibold mb-1">
              👥 Capacity
            </Text>
            <Text className="text-osu-dark">
              {event.attendee_count}/{event.capacity} attending
            </Text>
          </View>

          {event.description && (
            <View className="mb-4">
              <Text className="text-gray-600 font-semibold mb-1">
                📝 Description
              </Text>
              <Text className="text-osu-dark">{event.description}</Text>
            </View>
          )}

          <View className="mb-6">
            <Text className="text-gray-600 font-semibold mb-1">🎯 Host</Text>
            <Text className="text-osu-dark">
              {event.host?.display_name || event.host?.email.split("@")[0]}
            </Text>
          </View>

          {!isHost &&
            (event.is_joined ? (
              <SecondaryButton
                title="Leave Event"
                onPress={handleLeave}
                loading={actionLoading}
              />
            ) : (
              <PrimaryButton
                title="Join Event"
                onPress={handleJoin}
                disabled={isFull}
                loading={actionLoading}
              />
            ))}

          {isHost && (
            <View className="bg-osu-light p-4 rounded-lg">
              <Text className="text-osu-dark font-semibold">
                You are hosting this event
              </Text>
            </View>
          )}
        </Card>
      </View>
    </ScrollView>
  );
}
