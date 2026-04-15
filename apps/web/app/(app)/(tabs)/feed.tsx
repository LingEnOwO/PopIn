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
import { EVENT_TAGS, formatTagLabel, getTagColor } from 'shared';
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

const FILTER_TAGS_SESSION_KEY = 'popin-filter-tags';

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
    const [showTagPicker, setShowTagPicker] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [interestTags, setInterestTags] = useState<string[]>([]);

    // Session-persisted filter tags — independent from profile interest_tags
    const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>(() => {
        try {
            const saved = globalThis.sessionStorage?.getItem(FILTER_TAGS_SESSION_KEY);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    // Ref so fetchEvents can read latest tags without being in its dep array
    const selectedFilterTagsRef = useRef(selectedFilterTags);

    // Dedup guard: track event IDs that have already fired event_viewed this session
    const viewedIdsRef = useRef(new Set<string>());

    // Keep ref in sync; persist to sessionStorage for guests only
    useEffect(() => {
        selectedFilterTagsRef.current = selectedFilterTags;
        if (userId) return; // logged-in users derive from profile on picker open
        try {
            globalThis.sessionStorage?.setItem(
                FILTER_TAGS_SESSION_KEY,
                JSON.stringify(selectedFilterTags),
            );
        } catch {}
    }, [selectedFilterTags, userId]);

    const activeFilterLabel = (() => {
        if (filter === 'myInterests') {
            return selectedFilterTags.length > 0
                ? `Interests (${selectedFilterTags.length})`
                : 'My Interests';
        }
        return FILTER_OPTIONS.find((o) => o.value === filter)?.label || 'All';
    })();

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
                const tags = selectedFilterTagsRef.current;
                if (tags.length === 0) {
                    setEvents([]);
                    setLoading(false);
                    return;
                }
                query = query.overlaps('tags', tags);
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

    // Close picker and apply the selected tags to the feed
    const handlePickerClose = useCallback(() => {
        setShowTagPicker(false);
        if (filter === 'myInterests') {
            fetchEvents(true);
        }
    }, [filter, fetchEvents]);

    const handleSelectMyInterests = () => {
        setFilter('myInterests');
        setShowFilterMenu(false);
        // Logged-in: always start picker from current profile tags
        // Guest: keep whatever was last selected (sessionStorage)
        if (userId) {
            setSelectedFilterTags(interestTags);
        }
        setShowTagPicker(true);
    };

    const toggleTag = (tag: string) => {
        setSelectedFilterTags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
        );
    };

    return (
        <View className="flex-1 bg-gray-100">
            {/* Backdrop — closes any open panel */}
            {(showFilterMenu || showTagPicker) && (
                <TouchableOpacity
                    style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        zIndex: 10,
                    }}
                    activeOpacity={1}
                    onPress={() => {
                        setShowFilterMenu(false);
                        if (showTagPicker) handlePickerClose();
                    }}
                />
            )}

            {/* Controls: view toggle + filter */}
            <View className="px-4 py-3 flex-row items-start justify-between gap-3" style={{ zIndex: 20 }}>
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

                <View style={{ position: 'relative', alignItems: 'flex-end', flex: 1 }}>
                    <TouchableOpacity
                        onPress={() => {
                            setShowTagPicker(false);
                            setShowFilterMenu((v) => !v);
                        }}
                        activeOpacity={0.8}
                        className="flex-row items-center rounded-full bg-white px-4 py-2.5 border border-gray-200 shadow-sm"
                    >
                        <MaterialIcons name="tune" size={16} color="#374151" style={{ marginRight: 6 }} />
                        <Text className="font-semibold text-gray-700">{activeFilterLabel}</Text>
                    </TouchableOpacity>

                    {/* Filter dropdown */}
                    {showFilterMenu && (
                        <View
                            style={{
                                position: 'absolute',
                                top: 48,
                                right: 0,
                                width: 224,
                                borderRadius: 16,
                                backgroundColor: 'white',
                                borderWidth: 1,
                                borderColor: '#E5E7EB',
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.1,
                                shadowRadius: 12,
                                overflow: 'hidden',
                                zIndex: 30,
                            }}
                        >
                            <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>Filter by</Text>
                            </View>
                            {FILTER_OPTIONS.map((option) => {
                                const isActive = filter === option.value;
                                return (
                                    <TouchableOpacity
                                        key={option.value}
                                        onPress={
                                            option.value === 'myInterests'
                                                ? handleSelectMyInterests
                                                : () => {
                                                      setFilter(option.value);
                                                      setShowFilterMenu(false);
                                                  }
                                        }
                                        style={{
                                            paddingHorizontal: 16,
                                            paddingVertical: 12,
                                            backgroundColor: isActive ? '#F3F4F6' : 'white',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                        }}
                                    >
                                        <Text style={{ fontSize: 15, fontWeight: isActive ? '600' : '400', color: isActive ? '#111827' : '#374151' }}>
                                            {option.label}
                                        </Text>
                                        {option.value === 'myInterests' && (
                                            <MaterialIcons name="chevron-right" size={16} color="#9CA3AF" />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    {/* Tag picker panel */}
                    {showTagPicker && (
                        <View
                            style={{
                                position: 'absolute',
                                top: 48,
                                right: 0,
                                width: 320,
                                borderRadius: 16,
                                backgroundColor: 'white',
                                borderWidth: 1,
                                borderColor: '#E5E7EB',
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.1,
                                shadowRadius: 12,
                                overflow: 'hidden',
                                zIndex: 30,
                            }}
                        >
                            {/* Header */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                                    Pick interests
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    {selectedFilterTags.length > 0 && (
                                        <TouchableOpacity onPress={() => setSelectedFilterTags([])}>
                                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#BB0000' }}>Clear</Text>
                                        </TouchableOpacity>
                                    )}
                                    <TouchableOpacity onPress={handlePickerClose}>
                                        <MaterialIcons name="close" size={18} color="#6B7280" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Scrollable tag grid */}
                            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
                                    {EVENT_TAGS.map((tag) => {
                                        const isSelected = selectedFilterTags.includes(tag);
                                        const tagColor = getTagColor(tag);
                                        return (
                                            <TouchableOpacity
                                                key={tag}
                                                onPress={() => toggleTag(tag)}
                                                style={{
                                                    paddingHorizontal: 12,
                                                    paddingVertical: 6,
                                                    borderRadius: 999,
                                                    backgroundColor: isSelected ? tagColor.backgroundColor : '#F9FAFB',
                                                    borderWidth: 1,
                                                    borderColor: isSelected ? tagColor.backgroundColor : '#E5E7EB',
                                                }}
                                            >
                                                <Text style={{ fontSize: 13, color: isSelected ? tagColor.textColor : '#374151' }}>
                                                    {formatTagLabel(tag)}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </ScrollView>

                            {/* Done button */}
                            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
                                <TouchableOpacity
                                    onPress={handlePickerClose}
                                    style={{ backgroundColor: '#BB0000', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                                >
                                    <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>
                                        {selectedFilterTags.length > 0 ? `Show events (${selectedFilterTags.length})` : 'Done'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
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
                                {filter === 'myInterests' && selectedFilterTags.length === 0
                                    ? 'No interests selected'
                                    : 'No events found'}
                            </Text>
                            <Text className="text-gray-400 mt-2">
                                {filter === 'myInterests' && selectedFilterTags.length === 0
                                    ? 'Tap the filter button to pick interests'
                                    : 'Try a different filter'}
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
