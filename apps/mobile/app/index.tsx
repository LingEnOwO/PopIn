import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { supabase } from "../lib/supabase";
import { getPostHog } from "../lib/posthog";
import { PrimaryButton, SecondaryButton } from "../components/Button";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const validateEmail = (email: string) => {
    return email.toLowerCase().endsWith("@osu.edu");
  };

  const handleSendOTP = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email");
      return;
    }

    // Temporarily disabled OSU email validation for testing
    // if (!validateEmail(email)) {
    //   Alert.alert("Error", "Please use your @osu.edu email address");
    //   return;
    // }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase().trim(),
    });

    setLoading(false);

    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setOtpSent(true);
      setCooldown(30);
      Alert.alert("Success", "Check your email for the login code");
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) {
      Alert.alert("Error", "Please enter the verification code");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.toLowerCase().trim(),
      token: otp.trim(),
      type: "email",
    });

    if (error) {
      setLoading(false);
      Alert.alert("Error", error.message);
      return;
    }

    if (data.user) {
      // Identify user in PostHog once per login
      getPostHog().identify(data.user.id, { email: data.user.email ?? null });

      // Create profile if it doesn't exist
      // @ts-expect-error - Supabase type inference issue
      const { error: profileError } = await supabase.from("profiles").upsert(
        {
          id: data.user.id,
          email: data.user.email!,
        },
        {
          onConflict: "id",
          ignoreDuplicates: true,
        },
      );

      if (profileError) {
        console.error("Profile creation error:", profileError);
      }
    }

    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScrollView className="flex-1 bg-osu-light">
        <StatusBar style="dark" />
        <View className="flex-1 justify-center px-6">
          <View className="items-center mb-12">
            <Text className="text-5xl font-bold text-osu-scarlet mb-2">
              PopIn
            </Text>
            <Text className="text-lg text-osu-dark">OSU Student Events</Text>
          </View>

          <View className="bg-white rounded-2xl p-6 shadow-lg">
            <Text className="text-2xl font-bold text-osu-dark mb-6">
              {otpSent ? "Verify Code" : "Sign In"}
            </Text>

            {!otpSent ? (
              <>
                <Text className="text-osu-dark mb-2 font-medium">
                  OSU Email
                </Text>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 mb-6 text-base"
                  placeholder="name.###@osu.edu"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                />

                <PrimaryButton
                  title={cooldown > 0 ? `Wait ${cooldown}s` : "Send Code"}
                  onPress={handleSendOTP}
                  loading={loading}
                  disabled={cooldown > 0}
                />

                <Text className="text-gray-500 text-sm mt-4 text-center">
                  Only @osu.edu emails are allowed
                </Text>
              </>
            ) : (
              <>
                <Text className="text-gray-600 mb-4">
                  Enter the 6-digit code sent to {email}
                </Text>

                <Text className="text-osu-dark mb-2 font-medium">
                  Verification Code
                </Text>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 mb-6 text-base text-center tracking-widest"
                  placeholder="000000"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!loading}
                />

                <PrimaryButton
                  title="Verify"
                  onPress={handleVerifyOTP}
                  loading={loading}
                />

                <View className="mt-4">
                  <SecondaryButton
                    title={cooldown > 0 ? `Wait ${cooldown}s` : "Send New Code"}
                    onPress={() => {
                      setOtpSent(false);
                      setOtp("");
                    }}
                    disabled={loading || cooldown > 0}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
