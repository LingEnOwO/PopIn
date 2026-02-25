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
} from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import { PrimaryButton } from "../../components/Button";
import { Card } from "../../components/Card";

type RequiredField = "title" | "location" | "capacity";

type FieldErrors = Partial<Record<RequiredField, string>>;

const formatDate = (date: Date): string =>
  date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

const formatTime = (date: Date): string =>
  date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

export default function CreateEventScreen() {
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

  const [title, setTitle] = useState("");
  const [startDateTime, setStartDateTime] = useState(now);
  const [endDateTime, setEndDateTime] = useState(oneHourLater);
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [showStartDate, setShowStartDate] = useState(false);
  const [showStartTime, setShowStartTime] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [showEndTime, setShowEndTime] = useState(false);

  const validateRequiredFields = (): FieldErrors => {
    const errors: FieldErrors = {};

    if (!title.trim()) errors.title = "Title is required";
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

  const handleStartDateChange = (
    _event: DateTimePickerEvent,
    selected?: Date,
  ) => {
    setShowStartDate(false);
    if (selected) {
      const updated = new Date(startDateTime);
      updated.setFullYear(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate(),
      );
      setStartDateTime(updated);
    }
  };

  const handleStartTimeChange = (
    _event: DateTimePickerEvent,
    selected?: Date,
  ) => {
    setShowStartTime(false);
    if (selected) {
      const updated = new Date(startDateTime);
      updated.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setStartDateTime(updated);
    }
  };

  const handleEndDateChange = (
    _event: DateTimePickerEvent,
    selected?: Date,
  ) => {
    setShowEndDate(false);
    if (selected) {
      const updated = new Date(endDateTime);
      updated.setFullYear(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate(),
      );
      setEndDateTime(updated);
    }
  };

  const handleEndTimeChange = (
    _event: DateTimePickerEvent,
    selected?: Date,
  ) => {
    setShowEndTime(false);
    if (selected) {
      const updated = new Date(endDateTime);
      updated.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setEndDateTime(updated);
    }
  };

  const handleCreate = async () => {
    const requiredFieldErrors = validateRequiredFields();
    setFieldErrors(requiredFieldErrors);

    if (Object.keys(requiredFieldErrors).length > 0) {
      return;
    }

    const capacityNum = parseInt(capacity);
    if (isNaN(capacityNum) || capacityNum <= 0) {
      Alert.alert("Error", "Please enter a valid capacity");
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
            const resetNow = new Date();
            setTitle("");
            setStartDateTime(resetNow);
            setEndDateTime(new Date(resetNow.getTime() + 60 * 60 * 1000));
            setLocation("");
            setCapacity("");
            setDescription("");
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
            {renderRequiredLabel("Start Date")}
            <Pressable
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
              onPress={() => setShowStartDate(true)}
            >
              <Text className="text-base">{formatDate(startDateTime)}</Text>
            </Pressable>
            {showStartDate && (
              <DateTimePicker
                value={startDateTime}
                mode="date"
                display="default"
                onChange={handleStartDateChange}
              />
            )}
          </View>

          <View className="mb-4">
            {renderRequiredLabel("Start Time")}
            <Pressable
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
              onPress={() => setShowStartTime(true)}
            >
              <Text className="text-base">{formatTime(startDateTime)}</Text>
            </Pressable>
            {showStartTime && (
              <DateTimePicker
                value={startDateTime}
                mode="time"
                display="default"
                onChange={handleStartTimeChange}
              />
            )}
          </View>

          <View className="mb-4">
            {renderRequiredLabel("End Date")}
            <Pressable
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
              onPress={() => setShowEndDate(true)}
            >
              <Text className="text-base">{formatDate(endDateTime)}</Text>
            </Pressable>
            {showEndDate && (
              <DateTimePicker
                value={endDateTime}
                mode="date"
                display="default"
                onChange={handleEndDateChange}
              />
            )}
          </View>

          <View className="mb-4">
            {renderRequiredLabel("End Time")}
            <Pressable
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3"
              onPress={() => setShowEndTime(true)}
            >
              <Text className="text-base">{formatTime(endDateTime)}</Text>
            </Pressable>
            {showEndTime && (
              <DateTimePicker
                value={endDateTime}
                mode="time"
                display="default"
                onChange={handleEndTimeChange}
              />
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
            {renderRequiredLabel("Capacity")}
            <TextInput
              className={getInputClassName("capacity")}
              placeholder="Maximum number of attendees"
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
