import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

/**
 * Requests notification permissions, retrieves the Expo push token,
 * and saves it to the user's profile in Supabase.
 *
 * Safe to call on every app launch — silently skips simulators and
 * handles permission denial gracefully.
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  if (!Device.isDevice) {
    console.log("[notifications] Push notifications not supported on simulator");
    return;
  }

  // On Android, a notification channel is required
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[notifications] Push notification permission not granted");
    return;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

  if (!projectId) {
    console.warn("[notifications] EAS projectId not found — skipping token registration");
    return;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    console.log("[notifications] Expo push token:", token);

    const { error } = await (supabase.from("profiles") as any)
      .update({ expo_push_token: token })
      .eq("id", userId);

    if (error) {
      console.error("[notifications] Failed to save push token to profile:", error);
    } else {
      console.log("[notifications] Push token saved successfully");
    }
  } catch (err) {
    console.error("[notifications] Failed to get push token:", err);
  }
}
