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
import { supabase } from "../../lib/supabase";
import { PrimaryButton } from "../../components/Button";
import { Card } from "../../components/Card";

export default function FeedbackScreen() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) {
      Alert.alert("Error", "Please enter your feedback");
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // @ts-expect-error - Supabase type inference issue
    const { error } = await supabase.from("feedback").insert({
      user_id: user?.id || null,
      message: message.trim(),
      screen: "feedback",
    });

    setLoading(false);

    if (error) {
      Alert.alert("Error", "Failed to submit feedback");
      console.error(error);
    } else {
      Alert.alert("Thank You!", "Your feedback has been submitted");
      setMessage("");
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
          <Text className="text-2xl font-bold text-osu-dark mb-2">
            Feedback
          </Text>
          <Text className="text-gray-600 mb-6">
            Help us improve PopIn! Share your thoughts, suggestions, or report
            issues.
          </Text>

          <View className="mb-6">
            <Text className="text-osu-dark mb-2 font-semibold">
              Your Message
            </Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-base"
              placeholder="Tell us what you think..."
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={8}
              textAlignVertical="top"
            />
          </View>

          <PrimaryButton
            title="Submit Feedback"
            onPress={handleSubmit}
            loading={loading}
          />
        </Card>

        <View className="mt-6 bg-white rounded-xl p-4">
          <Text className="text-osu-dark font-semibold mb-2">About PopIn</Text>
          <Text className="text-gray-600">
            PopIn is an OSU student events platform built to connect students
            with campus activities.
          </Text>
          <Text className="text-gray-500 text-sm mt-4">Version 1.0.0</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
