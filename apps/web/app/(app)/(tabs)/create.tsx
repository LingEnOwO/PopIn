import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  Modal,
  Pressable,
  Platform,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, router } from "expo-router";
import { EVENT_TAGS, formatTagLabel, getTagColor, type EventTag } from "shared";
import { supabase } from "../../../lib/supabase";
import { uploadEventPhoto } from "../../../lib/storage";
import { requestFeedRefresh } from "../../../lib/feedRefresh";
import { createNotificationsForAttendees } from "../../../lib/notifications";
import { getPostHog } from "../../../lib/posthog";
import { resolveEventLocation } from "../../../lib/geocode";
import { loadGoogleMaps } from "../../../lib/googleMaps";
import { PrimaryButton, SecondaryButton } from "../../../components/Button";

type RequiredField = "title" | "location";
type PickerTarget = "startDate" | "startTime" | "endDate" | "endTime";

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

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const toDateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toTimeInputValue = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const parseDateInputValue = (value: string): Date | null => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const applyTimeToDate = (baseDate: Date, value: string): Date | null => {
  const [hours, minutes] = value.split(":").map(Number);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const next = new Date(baseDate);
  next.setHours(hours, minutes, 0, 0);
  return next;
};

const toMinutePrecision = (date: Date): Date => {
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
};


const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;
const PLACEHOLDER_COLOR = "#9ca3af";

export default function CreateEventScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEditMode = !!editId;

  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const [title, setTitle] = useState("");
  const [startDateTime, setStartDateTime] = useState(oneHourLater);
  const [endDateTime, setEndDateTime] = useState(twoHoursLater);
  const [location, setLocation] = useState("");
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const [capacity, setCapacity] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTags, setSelectedTags] = useState<EventTag[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [removePhotoRequested, setRemovePhotoRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(isEditMode);
  const [userId, setUserId] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [eventPhoto, setEventPhoto] = useState<{ uri: string; base64: string; mimeType: string } | null>(null);

  const originalEventRef = useRef<{
    start_time: string;
    end_time: string;
    location_text: string;
    description: string | null;
  } | null>(null);

  const [currentAttendeeCount, setCurrentAttendeeCount] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRangeWarning, setShowRangeWarning] = useState(false);
  const [rangeWarningMessage, setRangeWarningMessage] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    if (endDateTime <= startDateTime) {
      setEndDateTime(new Date(startDateTime.getTime() + DEFAULT_EVENT_DURATION_MS));
    }
  }, [startDateTime, endDateTime]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  // Google Places Autocomplete for the location field
  useEffect(() => {
    if (!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || !locationInputRef.current) return;

    let destroyed = false;

    (async () => {
      const google = await loadGoogleMaps();
      if (destroyed || !locationInputRef.current) return;

      const autocomplete = new google.maps.places.Autocomplete(locationInputRef.current, {
        // Bias toward OSU campus bounding box
        bounds: { north: 40.0220, south: 39.9880, east: -83.0100, west: -83.0680 },
        fields: ['formatted_address', 'name', 'geometry'],
        strictBounds: false,
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place.geometry?.location) {
          setLocationLat(place.geometry.location.lat());
          setLocationLng(place.geometry.location.lng());
        }
        // Prefer the place name (e.g. "Ohio Union") over the street address
        const displayText = place.name || place.formatted_address || '';
        if (displayText) setLocation(displayText);
        setFieldErrors((prev) => ({ ...prev, location: undefined }));
      });
    })();

    return () => { destroyed = true; };
  }, [editLoading]);

  useEffect(() => {
    if (!isEditMode || !editId) return;

    (supabase
      .from("events")
      .select("title, start_time, end_time, location_text, location_lat, location_lng, capacity, description, tags, image_url, source_url")
      .eq("id", editId)
      .single() as any
    ).then(({ data, error }: { data: any; error: any }) => {
      if (error || !data) {
        Alert.alert("Error", "Failed to load event");
        router.back();
        return;
      }
      setTitle(data.title);
      setStartDateTime(new Date(data.start_time));
      setEndDateTime(new Date(data.end_time));
      setLocation(data.location_text);
      setLocationLat(data.location_lat ?? null);
      setLocationLng(data.location_lng ?? null);
      setCapacity(data.capacity ? String(data.capacity) : "");
      setDescription(data.description || "");
      setSelectedTags((data.tags as EventTag[]) || []);
      setSourceUrl(data.source_url || "");
      setExistingImageUrl(data.image_url || null);
      originalEventRef.current = {
        start_time: data.start_time,
        end_time: data.end_time,
        location_text: data.location_text,
        description: data.description ?? null,
      };

      (supabase
        .from("event_members")
        .select("*", { count: "exact", head: true })
        .eq("event_id", editId) as any
      ).then(({ count }: { count: number | null }) => {
        setCurrentAttendeeCount(count ?? 0);
      });

      setEditLoading(false);
    });
  }, [editId]);

  const pickEventPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Photo library access is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const asset = result.assets[0];
    setEventPhoto({
      uri: asset.uri,
      base64: asset.base64!,
      mimeType: asset.mimeType ?? "image/jpeg",
    });
    setRemovePhotoRequested(false);
  };


  const validateRequiredFields = (): FieldErrors => {
    const errors: FieldErrors = {};

    if (!title.trim()) errors.title = "Title is required";
    if (!location.trim()) errors.location = "Location is required";

    return errors;
  };

  const getInputClassName = (field: RequiredField) =>
    `bg-white border rounded-md px-4 py-3 text-base text-osu-dark ${
      fieldErrors[field] ? "border-red-500" : "border-gray-300"
    }`;

  const renderRequiredLabel = (label: string) => (
    <Text className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
      {label} <Text className="text-red-500">*</Text>
    </Text>
  );

  const clampStartDateTime = (dt: Date): Date => {
    const now = toMinutePrecision(new Date());
    if (dt < now) return new Date(now);
    return dt;
  };

  const notifyStartRangeViolation = (_minAllowed: Date) => {
    setRangeWarningMessage("Start time must be in the future.");
    setShowRangeWarning(true);
  };

  const applyPickerValue = (target: PickerTarget, selectedValue: Date) => {
    const boundedNow = toMinutePrecision(new Date());

    const clampStartDateTime = (date: Date): Date => {
      if (date < boundedNow) return new Date(boundedNow);
      return date;
    };

    if (target === "startDate") {
      const updated = new Date(startDateTime);
      updated.setFullYear(
        selectedValue.getFullYear(),
        selectedValue.getMonth(),
        selectedValue.getDate(),
      );
      const clamped = clampStartDateTime(updated);
      setStartDateTime(clamped);
      // Also push end forward if it's no longer after start
      if (endDateTime <= clamped) {
        setEndDateTime(new Date(clamped.getTime() + DEFAULT_EVENT_DURATION_MS));
      }
      if (clamped.getTime() !== updated.getTime()) {
        notifyStartRangeViolation(boundedNow);
      }
      setStartDateTime(clamped);
      return;
    }

    if (target === "startTime") {
      const updated = new Date(startDateTime);
      updated.setHours(selectedValue.getHours(), selectedValue.getMinutes(), 0, 0);
      const clamped = clampStartDateTime(updated);
      setStartDateTime(clamped);
      // Also push end forward if it's no longer after start
      if (endDateTime <= clamped) {
        setEndDateTime(new Date(clamped.getTime() + DEFAULT_EVENT_DURATION_MS));
      }
      if (clamped.getTime() !== updated.getTime()) {
        notifyStartRangeViolation(boundedNow);
      }
      setStartDateTime(clamped);
      return;
    }

    if (target === "endDate") {
      const updated = new Date(endDateTime);
      updated.setFullYear(
        selectedValue.getFullYear(),
        selectedValue.getMonth(),
        selectedValue.getDate(),
      );
      if (updated <= startDateTime) {
        setEndDateTime(new Date(startDateTime.getTime() + DEFAULT_EVENT_DURATION_MS));
        return;
      }
      setEndDateTime(updated);
      return;
    }

    const updated = new Date(endDateTime);
    updated.setHours(selectedValue.getHours(), selectedValue.getMinutes(), 0, 0);
    if (updated <= startDateTime) {
      setEndDateTime(new Date(startDateTime.getTime() + DEFAULT_EVENT_DURATION_MS));
      return;
    }
    setEndDateTime(updated);
  };

  const handleWebDateInputChange = (
    target: "startDate" | "endDate",
    value: string,
  ) => {
    const parsed = parseDateInputValue(value);
    if (!parsed) return;
    applyPickerValue(target, parsed);
  };

  const handleWebTimeInputChange = (
    target: "startTime" | "endTime",
    value: string,
  ) => {
    const baseDate = target === "startTime" ? startDateTime : endDateTime;
    const parsed = applyTimeToDate(baseDate, value);
    if (!parsed) return;
    applyPickerValue(target, parsed);
  };

  const handleReview = () => {
    setReviewError(null);

    const requiredFieldErrors = validateRequiredFields();
    setFieldErrors(requiredFieldErrors);

    if (Object.keys(requiredFieldErrors).length > 0) {
      return;
    }

    const trimmedCapacity = capacity.trim();
    const capacityNum = trimmedCapacity ? parseInt(trimmedCapacity, 10) : null;
    if (trimmedCapacity && (capacityNum == null || isNaN(capacityNum) || capacityNum < 2)) {
      Alert.alert("Error", "Capacity must be at least 2 (you as the host + at least 1 attendee), or leave blank for unlimited");
      return;
    }

    if (isEditMode && capacityNum != null && capacityNum < currentAttendeeCount) {
      Alert.alert(
        "Capacity Too Low",
        `This event already has ${currentAttendeeCount} attendee${currentAttendeeCount !== 1 ? "s" : ""}. New capacity must be at least ${currentAttendeeCount}.`,
      );
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

    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    const trimmedCapacity = capacity.trim();
    const capacityNum = trimmedCapacity ? parseInt(trimmedCapacity, 10) : null;

    setLoading(true);

    if (isEditMode && editId) {
      let nextImageUrl: string | null | undefined = undefined;
      if (eventPhoto && userId) {
        try {
          nextImageUrl = await uploadEventPhoto(
            userId,
            eventPhoto.base64,
            eventPhoto.mimeType,
          );
        } catch {
          Alert.alert("Error", "Failed to upload event photo");
          setLoading(false);
          return;
        }
      }
      if (removePhotoRequested) {
        nextImageUrl = null;
      }

      // Resolve coordinates if location changed or coords are missing
      let resolvedLat = locationLat;
      let resolvedLng = locationLng;
      const locationChanged = location.trim() !== originalEventRef.current?.location_text;
      if (locationChanged || resolvedLat == null || resolvedLng == null) {
        const coords = await resolveEventLocation(location.trim());
        resolvedLat = coords?.lat ?? null;
        resolvedLng = coords?.lng ?? null;
      }

      const updatePayload: Record<string, any> = {
        title: title.trim(),
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        location_text: location.trim(),
        location_lat: resolvedLat,
        location_lng: resolvedLng,
        capacity: capacityNum,
        description: description.trim() || null,
        tags: selectedTags,
        source_url: sourceUrl.trim() || null,
      };

      if (nextImageUrl !== undefined) {
        updatePayload.image_url = nextImageUrl;
      }

      const { error } = await (supabase.from("events") as any)
        .update(updatePayload)
        .eq("id", editId);

      setLoading(false);

      if (error) {
        Alert.alert("Error", error.message || "Failed to save changes");
        console.error(error);
      } else {
        if (userId) {
          supabase.functions
            .invoke("send-push", { body: { type: "update", event_id: editId, actor_id: userId } })
            .then(({ error: fnError }) => {
              if (fnError) console.warn("[push] update notify error:", fnError);
              else console.log("[push] update notification sent");
            })
            .catch((err) => console.warn("[push] update notify failed:", err));

          // Detect which meaningful fields changed and notify attendees
          const orig = originalEventRef.current;
          if (orig) {
            const changedFields: string[] = [];
            if (
              startDateTime.toISOString() !== new Date(orig.start_time).toISOString() ||
              endDateTime.toISOString() !== new Date(orig.end_time).toISOString()
            ) {
              changedFields.push("Time changed");
            }
            if (location.trim() !== orig.location_text) {
              changedFields.push("Location changed");
            }
            if ((description.trim() || null) !== orig.description) {
              changedFields.push("Description updated");
            }
            if (changedFields.length > 0) {
              createNotificationsForAttendees(
                editId,
                userId,
                "event_updated",
                changedFields
              ).catch((err) => console.warn("[notif] update notify failed:", err));
            }
          }
        }
        setShowConfirm(false);
        if (Platform.OS === "web") {
          globalThis.alert?.("Event updated successfully.");
          router.replace(`/event/${editId}`);
        } else {
          Alert.alert("Saved", "Event updated successfully.", [
            { text: "OK", onPress: () => router.replace(`/event/${editId}`) },
          ]);
        }
      }
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to create an event");
        setLoading(false);
        return;
      }

      let imageUrl: string | null = null;
      if (eventPhoto) {
        try {
          imageUrl = await uploadEventPhoto(user.id, eventPhoto.base64, eventPhoto.mimeType);
        } catch {
          Alert.alert("Error", "Failed to upload event photo");
          setLoading(false);
          return;
        }
      }

      // Resolve coordinates — Places Autocomplete may have already set them,
      // otherwise fall back to the OSU dictionary + Google geocoding pipeline.
      let resolvedLat = locationLat;
      let resolvedLng = locationLng;
      if (resolvedLat == null || resolvedLng == null) {
        const coords = await resolveEventLocation(location.trim());
        resolvedLat = coords?.lat ?? null;
        resolvedLng = coords?.lng ?? null;
      }

      // @ts-expect-error - Supabase type inference issue
      const { data: eventData, error } = await supabase.from("events").insert({
        host_id: user.id,
        title: title.trim(),
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        location_text: location.trim(),
        location_lat: resolvedLat,
        location_lng: resolvedLng,
        capacity: capacityNum,
        description: description.trim() || null,
        tags: selectedTags,
        source_url: sourceUrl.trim() || null,
        image_url: imageUrl,
        status: "active" as const,
      }).select("id").single();

      if (!error && eventData) {
        // @ts-expect-error - Supabase type inference issue
        await supabase.from("event_members").insert({
          event_id: (eventData as any).id,
          user_id: user.id,
        });
      }

      setLoading(false);

      if (error) {
        Alert.alert("Error", error.message || "Failed to create event");
        console.error(error);
      } else {
        getPostHog().capture('event_created', {
          event_id: (eventData as any)?.id,
          event_title: title.trim(),
          event_start_time: startDateTime.toISOString(),
          event_location: location.trim(),
          creator_id: user.id,
        });
        setShowConfirm(false);
        Alert.alert("Success", "Event created successfully!");
        const resetNow = new Date();
        setTitle("");
        setStartDateTime(new Date(resetNow.getTime() + 60 * 60 * 1000));
        setEndDateTime(new Date(resetNow.getTime() + 2 * 60 * 60 * 1000));
        setLocation("");
        setLocationLat(null);
        setLocationLng(null);
        setCapacity("");
        setDescription("");
        setSelectedTags([]);
        setSourceUrl("");
        setEventPhoto(null);
        requestFeedRefresh();
        router.replace("/(app)/(tabs)/feed");
      }
    }
  };

  if (editLoading) {
    return (
      <View className="flex-1 bg-osu-light items-center justify-center">
        <ActivityIndicator size="large" color="#BB0000" />
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1 bg-white"
        contentContainerStyle={{ paddingBottom: 88 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="p-4" style={{ width: "100%", maxWidth: 920, alignSelf: "center" }}>
          <View className="p-0 overflow-hidden bg-white">
            <View className="p-5 pb-4">
              <Text className="text-3xl font-bold text-osu-dark">
                {isEditMode ? "Edit Event" : "Create New Event"}
              </Text>
            </View>

            <View className="px-5 py-4 border-b border-gray-200">
            {renderRequiredLabel("Title")}
            <TextInput
              className={getInputClassName("title")}
              placeholder="Event name"
              placeholderTextColor={PLACEHOLDER_COLOR}
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

            <View className="px-5 py-4 border-b border-gray-200">
            {renderRequiredLabel("Start Date")}
            <input
              type="date"
              value={toDateInputValue(startDateTime)}
              min={toDateInputValue(new Date())}
              onChange={(event) =>
                handleWebDateInputChange("startDate", event.currentTarget.value)
              }
              className="web-datetime-input"
            />
            </View>

            <View className="px-5 py-4 border-b border-gray-200">
            {renderRequiredLabel("Start Time")}
            <input
              type="time"
              value={toTimeInputValue(startDateTime)}
              min={
                isSameDay(startDateTime, new Date())
                  ? toTimeInputValue(new Date())
                  : undefined
              }
              onChange={(event) =>
                handleWebTimeInputChange("startTime", event.currentTarget.value)
              }
              className="web-datetime-input"
            />
            </View>

            <View className="px-5 py-4 border-b border-gray-200">
            {renderRequiredLabel("End Date")}
            <input
              type="date"
              value={toDateInputValue(endDateTime)}
              min={toDateInputValue(startDateTime)}
              onChange={(event) =>
                handleWebDateInputChange("endDate", event.currentTarget.value)
              }
              className="web-datetime-input"
            />
            </View>

            <View className="px-5 py-4 border-b border-gray-200">
            {renderRequiredLabel("End Time")}
            <input
              type="time"
              value={toTimeInputValue(endDateTime)}
              min={
                isSameDay(endDateTime, startDateTime)
                  ? toTimeInputValue(startDateTime)
                  : undefined
              }
              onChange={(event) =>
                handleWebTimeInputChange("endTime", event.currentTarget.value)
              }
              className="web-datetime-input"
            />
            </View>

            <View className="px-5 py-4 border-b border-gray-200">
            {renderRequiredLabel("Location")}
            {/* Native input so Google Places Autocomplete can attach to the DOM element */}
            <input
              ref={locationInputRef}
              type="text"
              placeholder="e.g., Ohio Union, Smith Lab Room 133"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                // Clear stored coords when user edits manually to prevent mismatch
                setLocationLat(null);
                setLocationLng(null);
                if (fieldErrors.location && e.target.value.trim()) {
                  setFieldErrors((prev) => ({ ...prev, location: undefined }));
                }
              }}
              className="web-datetime-input"
              style={{ borderColor: fieldErrors.location ? '#ef4444' : '#d1d5db', width: '100%' }}
            />
            {fieldErrors.location && (
              <Text className="text-red-500 text-sm mt-1">{fieldErrors.location}</Text>
            )}
            </View>

            <View className="px-5 py-4 border-b border-gray-200">
              <Text className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Capacity (Optional)</Text>
            <TextInput
              className="bg-white border border-gray-300 rounded-md px-4 py-3 text-base text-osu-dark"
              placeholder="Leave blank for unlimited"
              placeholderTextColor={PLACEHOLDER_COLOR}
              value={capacity}
              onChangeText={setCapacity}
              keyboardType="number-pad"
            />
            {(() => {
              const num = parseInt(capacity.trim(), 10);
              if (capacity.trim() && !isNaN(num)) {
                if (num < 2) {
                  return (
                    <Text className="text-red-500 text-sm mt-1">
                      Capacity must be at least 2 (you + 1 attendee). Leave blank for unlimited.
                    </Text>
                  );
                }
                if (isEditMode && num < currentAttendeeCount) {
                  return (
                    <Text className="text-red-500 text-sm mt-1">
                      This event already has {currentAttendeeCount} attendee{currentAttendeeCount !== 1 ? "s" : ""}. Capacity cannot be lower than the current attendee count.
                    </Text>
                  );
                }
              }
              return null;
            })()}
            </View>

            <View className="px-5 py-4 border-b border-gray-200">
              <Text className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
              Description (Optional)
            </Text>
            <TextInput
              className="bg-white border border-gray-300 rounded-md px-4 py-3 text-base text-osu-dark"
              placeholder="Tell people about your event..."
              placeholderTextColor={PLACEHOLDER_COLOR}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            </View>

            <View className="px-5 py-4 border-b border-gray-200">
              <Text className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
                Tags (Optional)
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {EVENT_TAGS.map((tag) => {
                  const selected = selectedTags.includes(tag);
                  const colors = getTagColor(tag);
                  return (
                    <Pressable
                      key={tag}
                      onPress={() =>
                        setSelectedTags((prev) =>
                          prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                        )
                      }
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: selected ? colors.textColor : "#e5e7eb",
                        backgroundColor: selected ? colors.backgroundColor : "#f9fafb",
                        opacity: selected ? 1 : 0.85,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: selected ? "600" : "400",
                          color: selected ? colors.textColor : "#6b7280",
                        }}
                      >
                        {formatTagLabel(tag)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View className="px-5 py-4 border-b border-gray-200">
              <Text className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
                Link (Optional)
              </Text>
              <TextInput
                className="bg-white border border-gray-300 rounded-md px-4 py-3 text-base text-osu-dark"
                placeholder="https://your-website-or-social-page.com"
                placeholderTextColor={PLACEHOLDER_COLOR}
                value={sourceUrl}
                onChangeText={setSourceUrl}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text className="text-gray-400 text-xs mt-1">
                Website, Instagram, Discord, sign-up form, etc.
              </Text>
            </View>

            <View className="px-5 py-4 border-b border-gray-200">
              <Text className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">
              Event Photo (Optional)
            </Text>
            <TouchableOpacity
              onPress={pickEventPhoto}
              className="bg-white border border-gray-300 rounded-md overflow-hidden"
            >
              {eventPhoto ? (
                <Image
                  source={{ uri: eventPhoto.uri }}
                  style={{ width: "100%", aspectRatio: 16 / 9 }}
                  resizeMode="cover"
                />
              ) : existingImageUrl ? (
                <Image
                  source={{ uri: existingImageUrl }}
                  style={{ width: "100%", aspectRatio: 16 / 9 }}
                  resizeMode="cover"
                />
              ) : (
                <View className="items-center justify-center py-8">
                  <Text className="text-gray-400 text-sm">Tap to add a photo</Text>
                </View>
              )}
            </TouchableOpacity>
            {(eventPhoto || existingImageUrl) && (
              <TouchableOpacity
                onPress={() => {
                  setEventPhoto(null);
                  setExistingImageUrl(null);
                  setRemovePhotoRequested(true);
                }}
                className="mt-1"
              >
                <Text className="text-red-500 text-sm">Remove photo</Text>
              </TouchableOpacity>
            )}
            </View>

            <View className="px-5 pt-6">
              {reviewError && (
                <View className="mb-3 border border-red-200 bg-red-50 rounded-xl p-3">
                  <Text className="text-red-700 text-sm">{reviewError}</Text>
                  <Pressable
                    className="mt-2 self-start bg-red-600 rounded-lg px-3 py-2"
                    onPress={snapStartToLatestAllowed}
                  >
                    <Text className="text-white text-sm font-semibold">
                      Use Latest Allowed Time
                    </Text>
                  </Pressable>
                </View>
              )}
              <PrimaryButton
                title={isEditMode ? "Review Changes" : "Review Event"}
                onPress={handleReview}
                loading={false}
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showConfirm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirm(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" }}>
          <View className="bg-white rounded-t-3xl" style={{ maxHeight: "90%" }}>
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
            >
              <Text className="text-xl font-bold text-osu-dark mb-5">
                {isEditMode ? "Review Changes" : "Review Your Event"}
              </Text>

              <View className="mb-3">
                <Text className="text-xs font-semibold text-gray-400 uppercase mb-0.5">Title</Text>
                <Text className="text-base text-osu-dark">{title.trim()}</Text>
              </View>

              <View className="mb-3">
                <Text className="text-xs font-semibold text-gray-400 uppercase mb-0.5">Start</Text>
                <Text className="text-base text-osu-dark">
                  {formatDate(startDateTime)} • {formatTime(startDateTime)}
                </Text>
              </View>

              <View className="mb-3">
                <Text className="text-xs font-semibold text-gray-400 uppercase mb-0.5">End</Text>
                <Text className="text-base text-osu-dark">
                  {formatDate(endDateTime)} • {formatTime(endDateTime)}
                </Text>
              </View>

              <View className="mb-3">
                <Text className="text-xs font-semibold text-gray-400 uppercase mb-0.5">Location</Text>
                <Text className="text-base text-osu-dark">{location.trim()}</Text>
              </View>

              <View className="mb-3">
                <Text className="text-xs font-semibold text-gray-400 uppercase mb-0.5">Capacity</Text>
                <Text className="text-base text-osu-dark">
                  {capacity.trim() ? capacity.trim() : "Unlimited"}
                </Text>
              </View>

              {description.trim() ? (
                <View className="mb-3">
                  <Text className="text-xs font-semibold text-gray-400 uppercase mb-0.5">Description</Text>
                  <Text className="text-base text-osu-dark">{description.trim()}</Text>
                </View>
              ) : null}

              {selectedTags.length > 0 ? (
                <View className="mb-3">
                  <Text className="text-xs font-semibold text-gray-400 uppercase mb-0.5">Tags</Text>
                  <Text className="text-base text-osu-dark">
                    {selectedTags.map((t) => formatTagLabel(t)).join(", ")}
                  </Text>
                </View>
              ) : null}

              {sourceUrl.trim() ? (
                <View className="mb-3">
                  <Text className="text-xs font-semibold text-gray-400 uppercase mb-0.5">Link</Text>
                  <Text className="text-base text-osu-scarlet">{sourceUrl.trim()}</Text>
                </View>
              ) : null}

              {eventPhoto && (
                <View className="mb-3">
                  <Text className="text-xs font-semibold text-gray-400 uppercase mb-0.5">Photo</Text>
                  <Image
                    source={{ uri: eventPhoto.uri }}
                    style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 8, marginTop: 4 }}
                    resizeMode="cover"
                  />
                </View>
              )}
            </ScrollView>

            <View className="flex-row px-6 pt-2 pb-10" style={{ gap: 12 }}>
              <View className="flex-1">
                <SecondaryButton
                  title="Edit"
                  onPress={() => setShowConfirm(false)}
                  disabled={loading}
                />
              </View>
              <View className="flex-1">
                <PrimaryButton
                  title={isEditMode ? "Save Changes" : "Confirm & Create"}
                  onPress={handleConfirm}
                  loading={loading}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showRangeWarning}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRangeWarning(false)}
      >
        <View style={{ flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 16 }}>
          <View className="bg-white rounded-2xl p-5" style={{ maxWidth: 440, width: "100%", alignSelf: "center" }}>
            <Text className="text-lg font-bold text-osu-dark mb-2">Invalid Start Time</Text>
            <Text className="text-base text-gray-700">{rangeWarningMessage}</Text>
            <Pressable
              className="mt-5 bg-osu-scarlet rounded-xl py-3 items-center"
              onPress={() => setShowRangeWarning(false)}
            >
              <Text className="text-white font-semibold">OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
