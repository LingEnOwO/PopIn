import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { PrimaryButton } from "../../components/Button";
import { Card } from "../../components/Card";

export default function CreateEventScreen() {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    // Validation
    if (
      !title.trim() ||
      !startDate ||
      !startTime ||
      !endDate ||
      !endTime ||
      !location.trim()
    ) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    const trimmedCapacity = capacity.trim();
    let capacityValue: number | undefined;

    if (trimmedCapacity) {
      const capacityNum = parseInt(trimmedCapacity, 10);
      if (isNaN(capacityNum) || capacityNum <= 0) {
        Alert.alert("Error", "Please enter a valid capacity or leave blank for unlimited");
        return;
      }
      capacityValue = capacityNum;
    }

    // Parse dates - expecting MM/DD/YYYY and HH:MM (24-hour)
    // Example: 02/15/2026 14:30
    const dateTimeRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
    const timeRegex = /^(\d{1,2}):(\d{2})$/;

    const startDateMatch = startDate.match(dateTimeRegex);
    const startTimeMatch = startTime.match(timeRegex);
    const endDateMatch = endDate.match(dateTimeRegex);
    const endTimeMatch = endTime.match(timeRegex);

    if (!startDateMatch || !startTimeMatch) {
      Alert.alert(
        "Error",
        "Invalid start date or time. Use MM/DD/YYYY for date and HH:MM for time (e.g., 02/15/2026 and 14:30)",
      );
      return;
    }

    if (!endDateMatch || !endTimeMatch) {
      Alert.alert(
        "Error",
        "Invalid end date or time. Use MM/DD/YYYY for date and HH:MM for time (e.g., 02/15/2026 and 16:30)",
      );
      return;
    }

    // Create date objects using individual components
    const startDateTime = new Date(
      parseInt(startDateMatch[3]), // year
      parseInt(startDateMatch[1]) - 1, // month (0-indexed)
      parseInt(startDateMatch[2]), // day
      parseInt(startTimeMatch[1]), // hour
      parseInt(startTimeMatch[2]), // minute
    );

    const endDateTime = new Date(
      parseInt(endDateMatch[3]), // year
      parseInt(endDateMatch[1]) - 1, // month (0-indexed)
      parseInt(endDateMatch[2]), // day
      parseInt(endTimeMatch[1]), // hour
      parseInt(endTimeMatch[2]), // minute
    );

    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      Alert.alert("Error", "Invalid date or time values");
      return;
    }

    if (endDateTime <= startDateTime) {
      Alert.alert("Error", "End time must be after start time");
      return;
    }

    if (startDateTime < new Date()) {
      Alert.alert("Error", "Start time must be in the future");
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      Alert.alert("Error", "You must be logged in to create an event");
      setLoading(false);
      return;
    }

    const eventPayload = {
      host_id: user.id,
      title: title.trim(),
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      location_text: location.trim(),
      ...(capacityValue !== undefined ? { capacity: capacityValue } : {}),
      description: description.trim() || null,
      status: "active" as const,
    };

    // @ts-expect-error - Supabase type inference issue
    const { error } = await supabase.from("events").insert(eventPayload);

    setLoading(false);

    if (error) {
      Alert.alert("Error", "Failed to create event");
      console.error(error);
    } else {
      Alert.alert("Success", "Event created successfully!", [
        {
          text: "OK",
          onPress: () => {
            // Clear form
            setTitle("");
            setStartDate("");
            setStartTime("");
            setEndDate("");
            setEndTime("");
            setLocation("");
            setCapacity("");
            setDescription("");
            // Navigate to feed
            router.push("/(app)/feed");
          },
        },
      ]);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView
        className="flex-1 bg-osu-light"
        contentContainerStyle={{ padding: 16 }}
      >
        <Card>
          <Text className="text-2xl font-bold text-osu-dark mb-6">
            Create New Event
          </Text>

          <View className="mb-4">
            <Text className="text-osu-dark mb-2 font-semibold">Title *</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base"
              placeholder="Event name"
              value={title}
              onChangeText={setTitle}
            />
          </View>

          <View className="mb-4">
            <Text className="text-osu-dark mb-2 font-semibold">
              Start Date * (MM/DD/YYYY)
            </Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base"
              placeholder="02/15/2026"
              value={startDate}
              onChangeText={setStartDate}
            />
          </View>

          <View className="mb-4">
            <Text className="text-osu-dark mb-2 font-semibold">
              Start Time * (HH:MM 24h)
            </Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base"
              placeholder="14:30"
              value={startTime}
              onChangeText={setStartTime}
            />
          </View>

          <View className="mb-4">
            <Text className="text-osu-dark mb-2 font-semibold">
              End Date * (MM/DD/YYYY)
            </Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base"
              placeholder="02/15/2026"
              value={endDate}
              onChangeText={setEndDate}
            />
          </View>

          <View className="mb-4">
            <Text className="text-osu-dark mb-2 font-semibold">
              End Time * (HH:MM 24h)
            </Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base"
              placeholder="16:30"
              value={endTime}
              onChangeText={setEndTime}
            />
          </View>

          <View className="mb-4">
            <Text className="text-osu-dark mb-2 font-semibold">Location *</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base"
              placeholder="e.g., Thompson Library, Room 150"
              value={location}
              onChangeText={setLocation}
            />
          </View>

          <View className="mb-4">
            <Text className="text-osu-dark mb-2 font-semibold">
              Capacity (Optional)
            </Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base"
              placeholder="Default: Unlimited"
              value={capacity}
              onChangeText={setCapacity}
              keyboardType="number-pad"
            />
          </View>

          <View className="mb-6">
            <Text className="text-osu-dark mb-2 font-semibold">
              Description (Optional)
            </Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base"
              placeholder="Tell people about your event..."
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <PrimaryButton
            title="Create Event"
            onPress={handleCreate}
            loading={loading}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
