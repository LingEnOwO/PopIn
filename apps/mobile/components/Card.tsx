import React from "react";
import { View } from "react-native";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <View className={`bg-white rounded-xl p-5 shadow-sm ${className}`}>
      {children}
    </View>
  );
}
