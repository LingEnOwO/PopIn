import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";

const formatYear = (y: number) => (y === 6 ? "Graduate" : `Year ${y}`);
import { supabase } from "../../../lib/supabase";
import type { Profile, Event } from "shared";
import { Card } from "../../../components/Card";

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hostedEvents, setHostedEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchProfile = async () => {
      setLoading(true);

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (profileError) {
        Alert.alert("Error", "Failed to load profile");
        setLoading(false);
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
      setLoading(false);
    };

    fetchProfile();
  }, [id]);

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

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <ScrollView className="flex-1 bg-osu-light">
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
            <Text className="text-gray-500 text-sm">{profile.email}</Text>
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
          <View className="flex-row justify-around">
            <View className="items-center">
              <Text className="text-2xl font-bold text-osu-scarlet">
                {profile.hosted_count}
              </Text>
              <Text className="text-gray-500 text-sm">Events Hosted</Text>
            </View>
            <View className="items-center">
              <Text className="text-2xl font-bold text-osu-scarlet">
                {Math.round(profile.attendance_rate * 100)}%
              </Text>
              <Text className="text-gray-500 text-sm">Attendance Rate</Text>
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
