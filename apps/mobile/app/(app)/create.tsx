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
