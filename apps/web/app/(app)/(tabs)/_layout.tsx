import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { getUnreadNotificationCount } from '../../../lib/notifications';
import { registerBadgeRefresh } from '../../../lib/notifBadge';
import { Text, View } from 'react-native';

const renderTabIcon = (
    name: React.ComponentProps<typeof MaterialIcons>['name'],
    color: string,
    label: string,
) => (
    <View
        style={{
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
        }}
    >
        <MaterialIcons name={name} size={24} color={color} />
        <Text numberOfLines={1} style={{ color, fontSize: 10, fontWeight: '500' }}>{label}</Text>
    </View>
);

export default function TabsLayout() {
    const [notifCount, setNotifCount] = useState(0);

    const refreshBadge = () => {
        getUnreadNotificationCount().then(setNotifCount);
    };

    useEffect(() => {
        refreshBadge();
        registerBadgeRefresh(refreshBadge);
    }, []);

    return (
        <View style={{ flex: 1 }}>
            <Tabs
                screenOptions={{
                tabBarShowLabel: false,
                tabBarHideOnKeyboard: true,
                tabBarActiveTintColor: '#BB0000',
                tabBarInactiveTintColor: '#5F6368',
                tabBarStyle: {
                    backgroundColor: '#FFFFFF',
                    borderTopWidth: 0,
                    height: 72,
                    paddingTop: 4,
                    paddingBottom: 6,
                    elevation: 0,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: -2 },
                    shadowOpacity: 0.06,
                    shadowRadius: 8,
                },
                tabBarItemStyle: {
                    flex: 1,
                    flexDirection: 'column',
                    paddingTop: 4,
                    paddingBottom: 4,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                },
                tabBarIconStyle: {
                    margin: 0,
                    width: 28,
                    height: 28,
                    alignSelf: 'center',
                },
                tabBarLabelStyle: {
                    fontSize: 10,
                    fontWeight: '500',
                    marginTop: 2,
                },
                sceneStyle: {},
                headerShown: false,
            }}
        >
            <Tabs.Screen
                name="feed"
                options={{
                    title: 'Feed',
                    tabBarIcon: ({ color, focused }) =>
                        renderTabIcon(focused ? 'home-filled' : 'home', color, 'Feed'),
                }}
            />
            <Tabs.Screen
                name="create"
                options={{
                    title: 'Create Event',
                    tabBarIcon: ({ color }) =>
                        renderTabIcon('add-box', color, 'Create'),
                }}
            />
            <Tabs.Screen
                name="my-events"
                options={{
                    title: 'My Events',
                    tabBarIcon: ({ color, focused }) =>
                        renderTabIcon(focused ? 'event' : 'event-note', color, 'My Events'),
                    tabBarBadge: notifCount > 0 ? (notifCount > 9 ? '9+' : notifCount) : undefined,
                    tabBarBadgeStyle: { backgroundColor: '#BB0000', fontSize: 10 },
                }}
            />
            <Tabs.Screen
                name="feedback"
                options={{
                    title: 'Feedback',
                    tabBarIcon: ({ color, focused }) =>
                        renderTabIcon(focused ? 'forum' : 'feedback', color, 'Feedback'),
                }}
            />
            <Tabs.Screen
                name="my-profile"
                options={{
                    title: 'My Profile',
                    tabBarIcon: ({ color }) =>
                        renderTabIcon('account-circle', color, 'Profile'),
                }}
            />
            </Tabs>
        </View>
    );
}
