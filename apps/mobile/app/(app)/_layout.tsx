import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function AppLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: "#BB0000",
          tabBarInactiveTintColor: "#999",
          tabBarStyle: {
            borderTopWidth: 1,
            borderTopColor: "#E5E5E5",
          },
          headerStyle: {
            backgroundColor: "#BB0000",
          },
          headerTintColor: "#FFFFFF",
          headerTitleStyle: {
            fontWeight: "bold",
          },
        }}
      >
        <Tabs.Screen
          name="feed"
          options={{
            title: "Feed",
            tabBarIcon: () => null,
            tabBarLabel: "Feed",
          }}
        />
        <Tabs.Screen
          name="create"
          options={{
            title: "Create Event",
            tabBarIcon: () => null,
            tabBarLabel: "Create",
          }}
        />
        <Tabs.Screen
          name="my-events"
          options={{
            title: "My Events",
            tabBarIcon: () => null,
            tabBarLabel: "My Events",
          }}
        />
        <Tabs.Screen
          name="feedback"
          options={{
            title: "Feedback",
            tabBarIcon: () => null,
            tabBarLabel: "Feedback",
          }}
        />
        <Tabs.Screen
          name="my-profile"
          options={{
            title: "My Profile",
            tabBarIcon: () => null,
            tabBarLabel: "Profile",
          }}
        />
        <Tabs.Screen
          name="event/[id]"
          options={{
            href: null,
            title: "Event Details",
          }}
        />
        <Tabs.Screen
          name="profile/[id]"
          options={{
            href: null,
            title: "Profile",
          }}
        />
      </Tabs>
    </>
  );
}
