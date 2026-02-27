import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { PrimaryButton, SecondaryButton } from "../../../../components/Button";
import { Card } from "../../../../components/Card";

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

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

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [startDateTime, setStartDateTime] = useState(new Date());
  const [endDateTime, setEndDateTime] = useState(new Date());
  const [location, setLocation] = useState("");

  const [showStartDate, setShowStartDate] = useState(false);
  const [showStartTime, setShowStartTime] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [showEndTime, setShowEndTime] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  useEffect(() => {
    if (!id) return;

    (supabase
      .from("events")
      .select("host_id, start_time, end_time, location_text")
      .eq("id", id)
      .single() as any
    ).then(({ data, error }: { data: any; error: any }) => {
        if (error || !data) {
          Alert.alert("Error", "Failed to load event");
          router.back();
          return;
        }
        setStartDateTime(new Date(data.start_time));
        setEndDateTime(new Date(data.end_time));
        setLocation(data.location_text);
        setLoading(false);
      });
  }, [id]);

  const handleStartDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    setShowStartDate(false);
    if (selected) {
      const updated = new Date(startDateTime);
      updated.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setStartDateTime(updated);
    }
  };

  const handleStartTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    setShowStartTime(false);
    if (selected) {
      const updated = new Date(startDateTime);
      updated.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setStartDateTime(updated);
    }
  };

  const handleEndDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    setShowEndDate(false);
    if (selected) {
      const updated = new Date(endDateTime);
      updated.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setEndDateTime(updated);
    }
  };

  const handleEndTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    setShowEndTime(false);
    if (selected) {
      const updated = new Date(endDateTime);
      updated.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setEndDateTime(updated);
    }
  };

  const handleSave = async () => {
    if (!userId) return;

    if (!location.trim()) {
      Alert.alert("Error", "Location is required");
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

    if (startDateTime.getTime() - new Date().getTime() > FORTY_EIGHT_HOURS_MS) {
      Alert.alert("Error", "Start time must be within 48 hours from now");
      return;
    }

    setSaving(true);

    const { error } = await (supabase.from("events") as any)
      .update({
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        location_text: location.trim(),
      })
      .eq("id", id);

    if (error) {
      setSaving(false);
      Alert.alert("Error", "Failed to save changes");
      console.error(error);
      return;
    }

    // Notify all members except the host about the update (fire-and-forget)
    supabase.functions
      .invoke("send-push", {
        body: { type: "update", event_id: id, actor_id: userId },
      })
      .then(({ error: fnError }) => {
        if (fnError) console.warn("[push] update notify error:", fnError);
        else console.log("[push] update notification sent");
      })
      .catch((err) => console.warn("[push] update notify failed:", err));

    setSaving(false);
    Alert.alert("Saved", "Event updated successfully.", [
      { text: "OK", onPress: () => router.back() },
    ]);
  };

  if (loading) {
    return (
      <View className="flex-1 bg-osu-light items-center justify-center">
        <ActivityIndicator size="large" color="#BB0000" />
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-osu-light"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      enableOnAndroid
      extraScrollHeight={80}
    >
      <Card>
        <Text className="text-2xl font-bold text-osu-dark mb-6">
          Edit Event
        </Text>

        <View className="mb-4">
          <Text className="text-osu-dark mb-2 font-semibold">
            Start Date <Text className="text-red-500">*</Text>
          </Text>
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
              minimumDate={new Date()}
              onChange={handleStartDateChange}
            />
          )}
        </View>

        <View className="mb-4">
          <Text className="text-osu-dark mb-2 font-semibold">
            Start Time <Text className="text-red-500">*</Text>
          </Text>
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
              minimumDate={isSameDay(startDateTime, new Date()) ? new Date() : undefined}
              onChange={handleStartTimeChange}
            />
          )}
        </View>

        <View className="mb-4">
          <Text className="text-osu-dark mb-2 font-semibold">
            End Date <Text className="text-red-500">*</Text>
          </Text>
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
              minimumDate={startDateTime}
              onChange={handleEndDateChange}
            />
          )}
        </View>

        <View className="mb-4">
          <Text className="text-osu-dark mb-2 font-semibold">
            End Time <Text className="text-red-500">*</Text>
          </Text>
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
              minimumDate={isSameDay(endDateTime, startDateTime) ? startDateTime : undefined}
              onChange={handleEndTimeChange}
            />
          )}
        </View>

        <View className="mb-6">
          <Text className="text-osu-dark mb-2 font-semibold">
            Location <Text className="text-red-500">*</Text>
          </Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base"
            placeholder="e.g., Thompson Library, Room 150"
            value={location}
            onChangeText={setLocation}
          />
        </View>

        <View style={{ gap: 10 }}>
          <PrimaryButton title="Save Changes" onPress={handleSave} loading={saving} />
          <SecondaryButton
            title="Discard"
            onPress={() => router.back()}
            disabled={saving}
          />
        </View>
      </Card>
    </KeyboardAwareScrollView>
  );
}
