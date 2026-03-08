import { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    RefreshControl,
    TouchableOpacity,
    Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import type { EventWithDetails } from 'shared';
import { EventCard } from '../../../components/EventCard';
import { VisibilityTracker } from '../../../components/VisibilityTracker';
import { getPostHog, buildEventProps } from '../../../lib/posthog';
import { consumeFeedRefreshRequest } from '../../../lib/feedRefresh';

type FilterType = 'all' | 'next3hours' | 'today';

const FILTER_OPTIONS: Array<{ value: FilterType; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'next3hours', label: 'Next 3h' },
    { value: 'today', label: 'Today' },
];

const feedCache: Partial<Record<FilterType, EventWithDetails[]>> = {};

// Module-level flag: fires feed_opened only once per browser session
let feedOpenedFired = false;

const compareByStartTime = (a: EventWithDetails, b: EventWithDetails) =>
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime();

export default function FeedScreen() {
    const [events, setEvents] = useState<EventWithDetails[]>(
        () => feedCache.all || [],
    );
    const [loading, setLoading] = useState(() => !feedCache.all);
    const [filter, setFilter] = useState<FilterType>('all');
    const [userId, setUserId] = useState<string | null>(null);
    // Dedup guard: track event IDs that have already fired event_viewed this session
    const viewedIdsRef = useRef(new Set<string>());

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setUserId(data.user?.id || null);
        });
    }, []);

    useEffect(() => {
        if (!feedOpenedFired) {
            feedOpenedFired = true;
            getPostHog().capture('feed_opened');
        }
    }, []);

    const fetchEvents = useCallback(
        async (force = false) => {
            if (!force && feedCache[filter]) {
                setEvents(feedCache[filter] || []);
                setLoading(false);
                return;
            }

            setLoading(true);

            let query = supabase
                .from('events')
                .select(
                    `
        *,
        host:profiles!events_host_id_fkey(id, email, display_name),
        event_members(user_id)
      `,
                )
                .eq('status', 'active')
                .gte('start_time', new Date().toISOString())
                .order('start_time', { ascending: true });

            const now = new Date();

            if (filter === 'next3hours') {
                const threeHoursLater = new Date(
                    now.getTime() + 3 * 60 * 60 * 1000,
                );
                query = query.lte('start_time', threeHoursLater.toISOString());
            } else if (filter === 'today') {
                const endOfDay = new Date(now);
                endOfDay.setHours(23, 59, 59, 999);
                query = query.lte('start_time', endOfDay.toISOString());
            }

            const { data, error } = await query;

            if (error) {
                Alert.alert('Error', 'Failed to load events');
                console.error(error);
            } else {
                const eventsWithDetails: EventWithDetails[] = (data || []).map(
                    (event: any) => ({
                        ...event,
                        host: event.host,
                        attendee_count: event.event_members?.length || 0,
                        is_joined: userId
                            ? event.event_members?.some(
                                  (m: any) => m.user_id === userId,
                              )
                            : false,
                    }),
                );
                const sortedEvents = [...eventsWithDetails].sort(
                    compareByStartTime,
                );
                feedCache[filter] = sortedEvents;
                setEvents(sortedEvents);
            }

            setLoading(false);
        },
        [filter, userId],
    );

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    useFocusEffect(
        useCallback(() => {
            if (consumeFeedRefreshRequest()) {
                fetchEvents(true);
            }
        }, [fetchEvents]),
    );

    return (
        <View className="flex-1 bg-gray-100">
            <View className="px-4 py-3 items-center">
                <View className="flex-row items-center rounded-full border border-gray-300 p-1">
                    {FILTER_OPTIONS.map((option, index) => {
                        const isActive = filter === option.value;

                        return (
                            <TouchableOpacity
                                key={option.value}
                                onPress={() => setFilter(option.value)}
                                className={`px-4 py-2 rounded-full ${
                                    isActive
                                        ? 'bg-osu-scarlet'
                                        : 'bg-transparent'
                                }`}
                                style={{
                                    marginRight:
                                        index < FILTER_OPTIONS.length - 1
                                            ? 4
                                            : 0,
                                }}
                            >
                                <Text
                                    className={`font-semibold ${
                                        isActive
                                            ? 'text-white'
                                            : 'text-gray-700'
                                    }`}
                                >
                                    {option.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingTop: 16, paddingBottom: 0 }}
                refreshControl={
                    <RefreshControl
                        refreshing={loading}
                        onRefresh={() => fetchEvents(true)}
                        tintColor="#BB0000"
                    />
                }
            >
                {events.length === 0 && !loading && (
                    <View className="items-center justify-center py-12">
                        <Text className="text-gray-500 text-lg">
                            No events found
                        </Text>
                        <Text className="text-gray-400 mt-2">
                            Try a different filter
                        </Text>
                    </View>
                )}

                {events.map((event, index) => (
                    <VisibilityTracker
                        key={event.id}
                        onVisible={() => {
                            if (!viewedIdsRef.current.has(event.id)) {
                                viewedIdsRef.current.add(event.id);
                                getPostHog().capture('event_viewed', {
                                    ...buildEventProps(event),
                                    event_position: index + 1,
                                });
                            }
                        }}
                    >
                        <View className="mx-4 mb-4">
                            <EventCard event={event} />
                        </View>
                    </VisibilityTracker>
                ))}
            </ScrollView>
        </View>
    );
}
