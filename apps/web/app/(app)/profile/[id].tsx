import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useFocusEffect } from "expo-router";

const formatYear = (y: number) => (y === 6 ? "Graduate" : `Year ${y}`);
import { supabase } from "../../../lib/supabase";
import type { Profile, Event } from "shared";
import { Card } from "../../../components/Card";

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hostedEvents, setHostedEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchProfile = useCallback(
    async (isPullToRefresh = false) => {
      if (!id) return;

      if (isPullToRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (profileError) {
        Alert.alert("Error", "Failed to load profile");
        if (isPullToRefresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
        return;
      }

      setProfile(profileData as Profile);

      const { data: eventsData } = await supabase
        .from("events")
        .select("*")
        .eq("host_id", id)
        .eq("status", "active")
        .order("start_time", { ascending: true });

      setHostedEvents((eventsData as Event[]) ?? []);
      if (isPullToRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    if (!id) return;

    fetchProfile();
  }, [id, fetchProfile]);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      fetchProfile();
    }, [id, fetchProfile]),
  );

  if (loading) {
    return (
      <View className="flex-1 bg-osu-light items-center justify-center">
        <ActivityIndicator size="large" color="#BB0000" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View className="flex-1 bg-osu-light items-center justify-center">
        <Text className="text-gray-500">Profile not found</Text>
      </View>
    );
  }

  const displayName = profile.display_name || profile.email.split("@")[0];
  const initials = displayName.slice(0, 2).toUpperCase();
  const rawAttendanceRate = Number(profile.attendance_rate ?? 0);
  const attendanceRate =
    rawAttendanceRate > 0 && rawAttendanceRate <= 1
      ? Math.round(rawAttendanceRate * 100)
      : Math.round(rawAttendanceRate);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <ScrollView
      className="flex-1 bg-osu-light"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => fetchProfile(true)}
          tintColor="#BB0000"
        />
      }
    >
      <View className="p-4 gap-4">
        {/* Avatar + Name */}
        <Card>
          <View className="items-center mb-4">
            {profile.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                className="w-24 h-24 rounded-full mb-3"
              />
            ) : (
              <View className="w-24 h-24 rounded-full bg-osu-scarlet items-center justify-center mb-3">
                <Text className="text-white text-3xl font-bold">{initials}</Text>
              </View>
            )}
            <Text className="text-2xl font-bold text-osu-dark">
              {displayName}
            </Text>
          </View>

          {/* Academic Info */}
          {(profile.major || profile.year) && (
            <View className="flex-row gap-3 justify-center flex-wrap">
              {profile.major && (
                <View className="bg-osu-light px-3 py-1 rounded-full">
                  <Text className="text-osu-dark text-sm">{profile.major}</Text>
                </View>
              )}
              {profile.year && (
                <View className="bg-osu-light px-3 py-1 rounded-full">
                  <Text className="text-osu-dark text-sm">
                    {formatYear(profile.year!)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </Card>

        {/* Stats */}
        <Card>
          <Text className="text-gray-600 font-semibold mb-3">Stats</Text>
          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-gray-500 text-sm">Events Hosted</Text>
              <Text className="text-xl font-bold text-osu-scarlet">
                {profile.hosted_count}
              </Text>
            </View>
            </View>
        </Card>

        {/* Interests */}
        {profile.interest_tags.length > 0 && (
          <Card>
            <Text className="text-gray-600 font-semibold mb-3">Interests</Text>
            <View className="flex-row flex-wrap gap-2">
              {profile.interest_tags.map((tag) => (
                <View
                  key={tag}
                  className="bg-osu-scarlet px-3 py-1 rounded-full"
                >
                  <Text className="text-white text-sm">{tag}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Hosted Events */}
        <Card>
          <Text className="text-gray-600 font-semibold mb-3">
            Hosting ({hostedEvents.length})
          </Text>
          {hostedEvents.length === 0 ? (
            <Text className="text-gray-400 text-sm">No upcoming events</Text>
          ) : (
            <View className="gap-3">
              {hostedEvents.map((event) => (
                <View
                  key={event.id}
                  className="border-b border-gray-100 pb-3 last:border-0 last:pb-0"
                >
                  <Text className="text-osu-dark font-semibold">
                    {event.title}
                  </Text>
                  <Text className="text-gray-500 text-sm">
                    {formatDate(event.start_time)} · {event.location_text}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </View>
    </ScrollView>
  );
}
