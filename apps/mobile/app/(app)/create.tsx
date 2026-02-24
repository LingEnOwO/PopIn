import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Modal,
} from "react-native";
import { router } from "expo-router";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { supabase } from "../../lib/supabase";
import { PrimaryButton } from "../../components/Button";
import { Card } from "../../components/Card";

type PickerTarget = "startDate" | "startTime" | "endDate" | "endTime" | null;

const formatDate = (value: Date) =>
  value.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

const formatTime = (value: Date) =>
  value.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const toNextFiveMinutes = (value: Date) => {
  const rounded = new Date(value);
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();
  const remainder = minutes % 5;

  if (remainder !== 0) {
    rounded.setMinutes(minutes + (5 - remainder));
  }

  return rounded;
};

const createDefaultStart = () => toNextFiveMinutes(new Date(Date.now() + 15 * 60 * 1000));

const createDefaultEnd = (start: Date) =>
  new Date(start.getTime() + 60 * 60 * 1000);

export default function CreateEventScreen() {
  const initialStart = createDefaultStart();
  const initialEnd = createDefaultEnd(initialStart);

  const [title, setTitle] = useState("");
  const [startDateTime, setStartDateTime] = useState<Date>(initialStart);
  const [endDateTime, setEndDateTime] = useState<Date>(initialEnd);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const pickerMode: "date" | "time" =
    pickerTarget === "startDate" || pickerTarget === "endDate"
      ? "date"
      : "time";

  const pickerMinimumDate =
    pickerTarget === "startDate"
      ? new Date()
      : pickerTarget === "endDate"
        ? startDateTime
        : undefined;

  const getPickerValue = () => {
    switch (pickerTarget) {
      case "startDate":
      case "startTime":
        return startDateTime;
      case "endDate":
      case "endTime":
        return endDateTime;
      default:
        return new Date();
    }
  };

  const updateDatePart = (current: Date, selected: Date) => {
    const base = current;
    return new Date(
      selected.getFullYear(),
      selected.getMonth(),
      selected.getDate(),
      base.getHours(),
      base.getMinutes(),
      0,
      0,
    );
  };

  const updateTimePart = (current: Date, selected: Date) => {
    const base = current;
    return new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      selected.getHours(),
      selected.getMinutes(),
      0,
      0,
    );
  };

  const handlePickerChange = (
    event: DateTimePickerEvent,
    selectedDate?: Date,
  ) => {
    if (event.type === "dismissed") {
      if (Platform.OS === "android") {
        setPickerTarget(null);
      }
      return;
    }

    if (!selectedDate || !pickerTarget) {
      return;
    }

    if (pickerTarget === "startDate") {
      setStartDateTime((current) => {
        const nextStart = updateDatePart(current, selectedDate);
        setEndDateTime((currentEnd) =>
          currentEnd <= nextStart
            ? new Date(nextStart.getTime() + 60 * 60 * 1000)
            : currentEnd,
        );
        return nextStart;
      });
    } else if (pickerTarget === "startTime") {
      setStartDateTime((current) => {
        const nextStart = updateTimePart(current, selectedDate);
        setEndDateTime((currentEnd) =>
          currentEnd <= nextStart
            ? new Date(nextStart.getTime() + 60 * 60 * 1000)
            : currentEnd,
        );
        return nextStart;
      });
    } else if (pickerTarget === "endDate") {
      setEndDateTime((current) => {
        const nextEnd = updateDatePart(current, selectedDate);
        return nextEnd <= startDateTime
          ? new Date(startDateTime.getTime() + 60 * 60 * 1000)
          : nextEnd;
      });
    } else if (pickerTarget === "endTime") {
      setEndDateTime((current) => {
        const nextEnd = updateTimePart(current, selectedDate);
        return nextEnd <= startDateTime
          ? new Date(startDateTime.getTime() + 60 * 60 * 1000)
          : nextEnd;
      });
    }

    if (Platform.OS === "android") {
      setPickerTarget(null);
    }
  };

  const handleCreate = async () => {
    // Validation
    if (
      !title.trim() ||
      !location.trim() ||
      !capacity
    ) {
      Alert.alert("Error", "Please fill in all required fields");
      return;
    }

    const capacityNum = parseInt(capacity);
    if (isNaN(capacityNum) || capacityNum <= 0) {
      Alert.alert("Error", "Please enter a valid capacity");
      return;
    }

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

    // @ts-expect-error - Supabase type inference issue
    const { error } = await supabase.from("events").insert({
      host_id: user.id,
      title: title.trim(),
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      location_text: location.trim(),
      capacity: capacityNum,
      description: description.trim() || null,
      status: "active" as const,
    });

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
            const resetStart = createDefaultStart();
            const resetEnd = createDefaultEnd(resetStart);
            setTitle("");
            setStartDateTime(resetStart);
            setEndDateTime(resetEnd);
            setPickerTarget(null);
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
            <Text className="text-osu-dark mb-2 font-semibold">Start Date *</Text>
            <Pressable
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
              onPress={() => setPickerTarget("startDate")}
            >
              <Text className="text-base text-osu-dark">
                {formatDate(startDateTime)}
              </Text>
            </Pressable>
          </View>

          <View className="mb-4">
            <Text className="text-osu-dark mb-2 font-semibold">Start Time *</Text>
            <Pressable
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
              onPress={() => setPickerTarget("startTime")}
            >
              <Text className="text-base text-osu-dark">
                {formatTime(startDateTime)}
              </Text>
            </Pressable>
          </View>

          <View className="mb-4">
            <Text className="text-osu-dark mb-2 font-semibold">End Date *</Text>
            <Pressable
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
              onPress={() => setPickerTarget("endDate")}
            >
              <Text className="text-base text-osu-dark">
                {formatDate(endDateTime)}
              </Text>
            </Pressable>
          </View>

          <View className="mb-4">
            <Text className="text-osu-dark mb-2 font-semibold">End Time *</Text>
            <Pressable
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
              onPress={() => setPickerTarget("endTime")}
            >
              <Text className="text-base text-osu-dark">
                {formatTime(endDateTime)}
              </Text>
            </Pressable>
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
            <Text className="text-osu-dark mb-2 font-semibold">Capacity *</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base"
              placeholder="Maximum number of attendees"
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

      {Platform.OS === "android" && pickerTarget && (
        <DateTimePicker
          value={getPickerValue()}
          mode={pickerMode}
          display="default"
          minimumDate={pickerMinimumDate}
          onChange={handlePickerChange}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal
          visible={Boolean(pickerTarget)}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerTarget(null)}
        >
          <Pressable
            className="flex-1 justify-center px-6"
            style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
            onPress={() => setPickerTarget(null)}
          >
            <Pressable
              className="bg-white rounded-xl p-5"
              onPress={(event) => event.stopPropagation()}
            >
              <Text className="text-osu-dark mb-2 font-semibold">
                {pickerMode === "date" ? "Pick a date" : "Pick a time"}
              </Text>
              {pickerTarget && (
                <DateTimePicker
                  value={getPickerValue()}
                  mode={pickerMode}
                  display={pickerMode === "date" ? "inline" : "spinner"}
                  minimumDate={pickerMinimumDate}
                  themeVariant="light"
                  onChange={handlePickerChange}
                />
              )}
              <Pressable className="mt-3" onPress={() => setPickerTarget(null)}>
                <Text className="text-osu-orange font-semibold text-right">Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}
