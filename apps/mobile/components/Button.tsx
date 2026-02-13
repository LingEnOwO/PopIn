import React from "react";
import { TouchableOpacity, Text, ActivityIndicator } from "react-native";

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
}

export function PrimaryButton({
  onPress,
  title,
  disabled,
  loading,
}: Omit<ButtonProps, "variant">) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={`bg-osu-scarlet py-4 px-6 rounded-xl items-center justify-center ${
        disabled || loading ? "opacity-50" : ""
      }`}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text className="text-white text-base font-semibold">{title}</Text>
      )}
    </TouchableOpacity>
  );
}

export function SecondaryButton({
  onPress,
  title,
  disabled,
  loading,
}: Omit<ButtonProps, "variant">) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      className={`border-2 border-osu-scarlet py-4 px-6 rounded-xl items-center justify-center ${
        disabled || loading ? "opacity-50" : ""
      }`}
    >
      {loading ? (
        <ActivityIndicator color="#BB0000" />
      ) : (
        <Text className="text-osu-scarlet text-base font-semibold">
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}
