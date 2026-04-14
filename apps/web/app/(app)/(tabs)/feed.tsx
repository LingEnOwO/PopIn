import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import {
    View,
    Text,
    ScrollView,
    RefreshControl,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import type { EventWithDetails } from 'shared';
import { EventCard } from '../../../components/EventCard';
import { VisibilityTracker } from '../../../components/VisibilityTracker';
import { getPostHog, buildEventProps } from '../../../lib/posthog';
import { consumeFeedRefreshRequest } from '../../../lib/feedRefresh';

const MapView = lazy(() => import('../../../components/MapView'));

type ViewMode = 'list' | 'map';

type FilterType = 'all' | 'next3hours' | 'today' | 'freeFood' | 'myInterests';

const FILTER_OPTIONS: Array<{ value: FilterType; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'next3hours', label: 'Next 3h' },
    { value: 'today', label: 'Today' },
    { value: 'freeFood', label: 'Free Food' },
    { value: 'myInterests', label: 'My Interests' },
];

const feedCache: Partial<Record<FilterType, EventWithDetails[]>> = {};

// Module-level flag: fires feed_opened only once per browser session
let feedOpenedFired = false;

const compareByStartTime = (a: EventWithDetails, b: EventWithDetails) =>
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime();

const calculateEventScore = (
    event: EventWithDetails,
    now: Date,
    interestTags: string[],
) => {
    const interestSet = new Set(interestTags);
    const matchCount = (event.tags || []).filter((tag) => interestSet.has(tag)).length;
    const hoursUntilEvent =
        (new Date(event.start_time).getTime() - now.getTime()) / (1000 * 60 * 60);

    return matchCount * 3 + (hoursUntilEvent < 24 ? 1 : 0);
};

const sortByScore = (
    events: EventWithDetails[],
    now: Date,
    interestTags: string[],
) =>
    [...events].sort((a, b) => {
        const scoreDiff =
            calculateEventScore(b, now, interestTags) -
            calculateEventScore(a, now, interestTags);

        if (scoreDiff !== 0) return scoreDiff;

        return compareByStartTime(a, b);
    });

export default function FeedScreen() {
    const [events, setEvents] = useState<EventWithDetails[]>(
        () => feedCache.all || [],
    );
    const [loading, setLoading] = useState(() => !feedCache.all);
    const [filter, setFilter] = useState<FilterType>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [interestTags, setInterestTags] = useState<string[]>([]);
    // Dedup guard: track event IDs that have already fired event_viewed this session
    const viewedIdsRef = useRef(new Set<string>());

    const activeFilterLabel =
        FILTER_OPTIONS.find((option) => option.value === filter)?.label || 'All';

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setUserId(data.user?.id || null);
        });
    }, []);

    useEffect(() => {
        if (!userId) {
            setInterestTags([]);
            return;
        }

        let cancelled = false;

        supabase
            .from('profiles')
            .select('interest_tags')
            .eq('id', userId)
            .single()
            .then(({ data, error }) => {
                if (cancelled) return;

                if (error) {
                    console.error(error);
                    setInterestTags([]);
                    return;
                }

                setInterestTags((data?.interest_tags || []).filter(Boolean));
            });

        return () => {
            cancelled = true;
        };
    }, [userId]);


    useEffect(() => {
        if (!feedOpenedFired) {
            feedOpenedFired = true;
            getPostHog().capture('feed_opened');
        }
    }, []);

    const fetchEvents = useCallback(
        async (force = false) => {
            const now = new Date();

            if (!force && feedCache[filter]) {
                setEvents(sortByScore(feedCache[filter] || [], now, interestTags));
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

            if (filter === 'next3hours') {
                const threeHoursLater = new Date(
                    now.getTime() + 3 * 60 * 60 * 1000,
                );
                query = query.lte('start_time', threeHoursLater.toISOString());
            } else if (filter === 'today') {
                const endOfDay = new Date(now);
                endOfDay.setHours(23, 59, 59, 999);
                query = query.lte('start_time', endOfDay.toISOString());
            } else if (filter === 'freeFood') {
                query = query.contains('tags', ['free_food']);
            } else if (filter === 'myInterests') {
                if (interestTags.length === 0) {
                    setEvents([]);
                    setLoading(false);
                    return;
                }

                query = query.overlaps('tags', interestTags);
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
                const sortedEvents = sortByScore(
                    eventsWithDetails,
                    now,
                    interestTags,
                );

                if (filter !== 'myInterests') {
                    feedCache[filter] = eventsWithDetails;
                }

                setEvents(sortedEvents);
            }

            setLoading(false);
        },
        [filter, userId, interestTags],
    );

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    useFocusEffect(
        useCallback(() => {
            consumeFeedRefreshRequest(); // clear any pending flag
            fetchEvents(true);
        }, [fetchEvents]),
    );

    return (
        <View className="flex-1 bg-gray-100">
            {/* Controls: Reddit-style sort dropdown + view toggle */}
            <View className="px-4 py-3 flex-row items-start justify-between gap-3 relative z-20">
                <View className="flex-row items-center rounded-full border border-gray-300 bg-white p-1">
                    {(['list', 'map'] as const).map((mode, i) => {
                        const isActive = viewMode === mode;
                        return (
                            <TouchableOpacity
                                key={mode}
                                onPress={() => setViewMode(mode)}
                                className={`px-4 py-2 rounded-full ${isActive ? 'bg-osu-scarlet' : 'bg-transparent'}`}
                                style={{ marginRight: i === 0 ? 4 : 0 }}
                            >
                                <Text className={`font-semibold ${isActive ? 'text-white' : 'text-gray-700'}`}>
                                    {mode === 'list' ? 'List' : 'Map'}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View className="relative items-end flex-1">
                    <TouchableOpacity
                        onPress={() => setShowFilterMenu((value) => !value)}
                        activeOpacity={0.8}
                        className="flex-row items-center rounded-full bg-white px-4 py-2.5 border border-gray-200 shadow-sm"
                    >
                        <MaterialIcons name="tune" size={16} color="#374151" style={{ marginRight: 6 }} />
                        <Text className="font-semibold text-gray-700">{activeFilterLabel}</Text>
                    </TouchableOpacity>

                    {showFilterMenu && (
                        <View className="absolute top-12 right-0 w-56 rounded-2xl bg-white border border-gray-200 shadow-lg overflow-hidden">
                            <View className="px-4 py-3 border-b border-gray-100">
                                <Text className="text-sm font-semibold text-gray-700">Filter by</Text>
                            </View>
                            {FILTER_OPTIONS.map((option) => {
                                const isActive = filter === option.value;
                                return (
                                    <TouchableOpacity
                                        key={option.value}
                                        onPress={() => {
                                            setFilter(option.value);
                                            setShowFilterMenu(false);
                                        }}
                                        className={`px-4 py-3 ${isActive ? 'bg-gray-100' : 'bg-white'}`}
                                    >
                                        <Text className={`text-base ${isActive ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                            {option.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>
            </View>

            {viewMode === 'map' ? (
                <Suspense fallback={<ActivityIndicator size="large" color="#BE0000" style={{ marginTop: 40 }} />}>
                    <MapView events={events} />
                </Suspense>
            ) : (
                <ScrollView
                    className="flex-1"
                    contentContainerStyle={{ paddingTop: 16, paddingBottom: 88 }}
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
            )}
        </View>
    );
}
