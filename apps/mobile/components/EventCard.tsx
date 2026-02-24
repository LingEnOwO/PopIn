import React from "react";
import { TouchableOpacity, Text, View } from "react-native";
import { router } from "expo-router";
import type { EventWithDetails } from "shared";
import { Card } from "./Card";

interface EventCardProps {
  event: EventWithDetails;
}

export function EventCard({ event }: EventCardProps) {
  const startDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const attendeeCount = event.attendee_count || 0;
  const isUnlimited = event.capacity === null;
  const spotsLeft = isUnlimited ? null : Math.max(event.capacity! - attendeeCount, 0);
  const isFull = !isUnlimited && spotsLeft !== null && spotsLeft <= 0;
  const scarcityCopy = isUnlimited
    ? attendeeCount === 0
      ? "Be the first to join 💪"
      : `${attendeeCount} joined`
    : attendeeCount === 0
      ? "Be the first to join 💪"
      : spotsLeft === 1
        ? "1 spot left"
        : `${spotsLeft} spots left`;

  return (
    <TouchableOpacity
      onPress={() => router.push(`/event/${event.id}`)}
      activeOpacity={0.7}
    >
      <Card className="mb-4">
        <View className="flex-row justify-between items-start mb-2">
          <Text
            className="text-lg font-bold text-osu-dark flex-1"
            numberOfLines={2}
          >
            {event.title}
          </Text>
          {isFull && (
            <View className="bg-osu-scarlet px-2 py-1 rounded ml-2">
              <Text className="text-white text-xs font-semibold">FULL</Text>
            </View>
          )}
        </View>

        <View className="mb-2">
          <Text className="text-osu-dark font-medium">
            {formatDate(startDate)} • {formatTime(startDate)} -{" "}
            {formatTime(endDate)}
          </Text>
        </View>

        <Text className="text-gray-600 mb-3" numberOfLines={1}>
          📍 {event.location_text}
        </Text>

        <View className="flex-row justify-between items-center">
          <Text className="text-gray-500 text-sm">{scarcityCopy}</Text>
          {event.host && (
            <Text className="text-gray-500 text-sm">
              by {event.host.display_name || event.host.email.split("@")[0]}
            </Text>
          )}
        </View>
      </Card>
    </TouchableOpacity>
  );
}
