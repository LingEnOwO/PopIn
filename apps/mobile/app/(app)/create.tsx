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

type RequiredField =
  | "title"
  | "startDate"
  | "startTime"
  | "endDate"
  | "endTime"
  | "location"
  | "capacity";

type FieldErrors = Partial<Record<RequiredField, string>>;

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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const validateRequiredFields = (): FieldErrors => {
    const errors: FieldErrors = {};

    if (!title.trim()) errors.title = "Title is required";
    if (!startDate.trim()) errors.startDate = "Start date is required";
    if (!startTime.trim()) errors.startTime = "Start time is required";
    if (!endDate.trim()) errors.endDate = "End date is required";
    if (!endTime.trim()) errors.endTime = "End time is required";
    if (!location.trim()) errors.location = "Location is required";
    if (!capacity.trim()) errors.capacity = "Capacity is required";

    return errors;
  };

  const getInputClassName = (field: RequiredField) =>
    `bg-gray-50 border rounded-lg px-4 py-3 text-base ${
      fieldErrors[field] ? "border-red-500" : "border-gray-200"
    }`;

  const renderRequiredLabel = (label: string) => (
    <Text className="text-osu-dark mb-2 font-semibold">
      {label} <Text className="text-red-500">*</Text>
    </Text>
  );

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
    const capacityNum = trimmedCapacity ? parseInt(trimmedCapacity, 10) : null;
    if (trimmedCapacity && (capacityNum == null || isNaN(capacityNum) || capacityNum <= 0)) {
      Alert.alert("Error", "Please enter a valid capacity or leave blank for unlimited");
      return;
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
            {renderRequiredLabel("Title")}
            <TextInput
              className={getInputClassName("title")}
              placeholder="Event name"
              value={title}
              onChangeText={(value) => {
                setTitle(value);
                if (fieldErrors.title && value.trim()) {
                  setFieldErrors((prev) => ({ ...prev, title: undefined }));
                }
              }}
            />
            {fieldErrors.title && (
              <Text className="text-red-500 text-sm mt-1">{fieldErrors.title}</Text>
            )}
          </View>

          <View className="mb-4">
            {renderRequiredLabel("Start Date (MM/DD/YYYY)")}
            <TextInput
              className={getInputClassName("startDate")}
              placeholder="02/15/2026"
              value={startDate}
              onChangeText={(value) => {
                setStartDate(value);
                if (fieldErrors.startDate && value.trim()) {
                  setFieldErrors((prev) => ({ ...prev, startDate: undefined }));
                }
              }}
            />
            {fieldErrors.startDate && (
              <Text className="text-red-500 text-sm mt-1">
                {fieldErrors.startDate}
              </Text>
            )}
          </View>

          <View className="mb-4">
            {renderRequiredLabel("Start Time (HH:MM 24h)")}
            <TextInput
              className={getInputClassName("startTime")}
              placeholder="14:30"
              value={startTime}
              onChangeText={(value) => {
                setStartTime(value);
                if (fieldErrors.startTime && value.trim()) {
                  setFieldErrors((prev) => ({ ...prev, startTime: undefined }));
                }
              }}
            />
            {fieldErrors.startTime && (
              <Text className="text-red-500 text-sm mt-1">
                {fieldErrors.startTime}
              </Text>
            )}
          </View>

          <View className="mb-4">
            {renderRequiredLabel("End Date (MM/DD/YYYY)")}
            <TextInput
              className={getInputClassName("endDate")}
              placeholder="02/15/2026"
              value={endDate}
              onChangeText={(value) => {
                setEndDate(value);
                if (fieldErrors.endDate && value.trim()) {
                  setFieldErrors((prev) => ({ ...prev, endDate: undefined }));
                }
              }}
            />
            {fieldErrors.endDate && (
              <Text className="text-red-500 text-sm mt-1">{fieldErrors.endDate}</Text>
            )}
          </View>

          <View className="mb-4">
            {renderRequiredLabel("End Time (HH:MM 24h)")}
            <TextInput
              className={getInputClassName("endTime")}
              placeholder="16:30"
              value={endTime}
              onChangeText={(value) => {
                setEndTime(value);
                if (fieldErrors.endTime && value.trim()) {
                  setFieldErrors((prev) => ({ ...prev, endTime: undefined }));
                }
              }}
            />
            {fieldErrors.endTime && (
              <Text className="text-red-500 text-sm mt-1">{fieldErrors.endTime}</Text>
            )}
          </View>

          <View className="mb-4">
            {renderRequiredLabel("Location")}
            <TextInput
              className={getInputClassName("location")}
              placeholder="e.g., Thompson Library, Room 150"
              value={location}
              onChangeText={(value) => {
                setLocation(value);
                if (fieldErrors.location && value.trim()) {
                  setFieldErrors((prev) => ({ ...prev, location: undefined }));
                }
              }}
            />
            {fieldErrors.location && (
              <Text className="text-red-500 text-sm mt-1">{fieldErrors.location}</Text>
            )}
          </View>

          <View className="mb-4">
            <Text className="text-osu-dark mb-2 font-semibold">Capacity (Optional)</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base"
              placeholder="Leave blank for unlimited"
              value={capacity}
              onChangeText={(value) => {
                setCapacity(value);
                if (fieldErrors.capacity && value.trim()) {
                  setFieldErrors((prev) => ({ ...prev, capacity: undefined }));
                }
              }}
              keyboardType="number-pad"
            />
            {fieldErrors.capacity && (
              <Text className="text-red-500 text-sm mt-1">{fieldErrors.capacity}</Text>
            )}
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
