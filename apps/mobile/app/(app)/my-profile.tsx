import { useState } from "react";
import {
  View,
  Text,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";

const YEAR_OPTIONS = [
  { label: "1st", value: 1 },
  { label: "2nd", value: 2 },
  { label: "3rd", value: 3 },
  { label: "4th", value: 4 },
  { label: "5th", value: 5 },
  { label: "Graduate", value: 6 },
];

const formatYear = (y: number) => (y === 6 ? "Graduate" : `Year ${y}`);
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { supabase } from "../../lib/supabase";
import type { Profile } from "shared";
import { Card } from "../../components/Card";
import { PrimaryButton, SecondaryButton } from "../../components/Button";

export default function MyProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [displayName, setDisplayName] = useState("");
  const [major, setMajor] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [interestTags, setInterestTags] = useState("");

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [])
  );

  const fetchProfile = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) {
      Alert.alert("Error", "Failed to load profile");
      setLoading(false);
      return;
    }

    const p = data as Profile;
    setProfile(p);
    setDisplayName(p.display_name ?? "");
    setMajor(p.major ?? "");
    setYear(p.year ?? null);
    setInterestTags(p.interest_tags.join(", "));
    setLoading(false);
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);

    const tags = interestTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        major: major.trim() || null,
        year,
        interest_tags: tags,
      })
      .eq("id", profile.id);

    setSaving(false);

    if (error) {
      Alert.alert("Error", "Failed to save profile");
      console.error(error);
    } else {
      setEditing(false);
      fetchProfile();
    }
  };

  const handleCancelEdit = () => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? "");
    setMajor(profile.major ?? "");
    setYear(profile.year ?? null);
    setInterestTags(profile.interest_tags.join(", "));
    setEditing(false);
  };

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

  const displayNameText = profile.display_name || profile.email.split("@")[0];
  const initials = displayNameText.slice(0, 2).toUpperCase();

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-osu-light"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid
      extraScrollHeight={80}
    >
      <View className="gap-4">
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
                  <Text className="text-white text-3xl font-bold">
                    {initials}
                  </Text>
                </View>
              )}
              <Text className="text-2xl font-bold text-osu-dark">
                {displayNameText}
              </Text>
              <Text className="text-gray-500 text-sm">{profile.email}</Text>
            </View>

            {!editing && (profile.major || profile.year) && (
              <View className="flex-row gap-3 justify-center flex-wrap mb-4">
                {profile.major && (
                  <View className="bg-osu-light px-3 py-1 rounded-full">
                    <Text className="text-osu-dark text-sm">{profile.major}</Text>
                  </View>
                )}
                {profile.year && (
                  <View className="bg-osu-light px-3 py-1 rounded-full">
                    <Text className="text-osu-dark text-sm">
                      {formatYear(profile.year)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {editing ? (
              <View className="gap-3">
                <View>
                  <Text className="text-gray-600 text-sm mb-1">Display Name</Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-base"
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Your name"
                  />
                </View>
                <View>
                  <Text className="text-gray-600 text-sm mb-1">Major</Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-base"
                    value={major}
                    onChangeText={setMajor}
                    placeholder="e.g. Computer Science"
                  />
                </View>
                <View>
                  <Text className="text-gray-600 text-sm mb-1">Year</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {YEAR_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => setYear(year === opt.value ? null : opt.value)}
                        className={`px-3 py-1.5 rounded-full border ${
                          year === opt.value
                            ? "bg-osu-scarlet border-osu-scarlet"
                            : "bg-gray-50 border-gray-200"
                        }`}
                      >
                        <Text
                          className={`text-sm ${
                            year === opt.value ? "text-white" : "text-osu-dark"
                          }`}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View>
                  <Text className="text-gray-600 text-sm mb-1">
                    Interests (comma-separated)
                  </Text>
                  <TextInput
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-base"
                    value={interestTags}
                    onChangeText={setInterestTags}
                    placeholder="e.g. hiking, gaming, music"
                  />
                </View>
                <PrimaryButton title="Save" onPress={handleSave} loading={saving} />
                <SecondaryButton title="Cancel" onPress={handleCancelEdit} />
              </View>
            ) : (
              <SecondaryButton title="Edit Profile" onPress={() => setEditing(true)} />
            )}
          </Card>

          {/* Stats */}
          {!editing && (
            <Card>
              <Text className="text-gray-600 font-semibold mb-3">Stats</Text>
              <View className="items-center">
                <Text className="text-2xl font-bold text-osu-scarlet">
                  {profile.hosted_count}
                </Text>
                <Text className="text-gray-500 text-sm">Events Hosted</Text>
              </View>
            </Card>
          )}

          {/* Interests */}
          {!editing && profile.interest_tags.length > 0 && (
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
      </View>
    </KeyboardAwareScrollView>
  );
}
