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

const FILTER_TAGS_SESSION_KEY = 'popin-filter-tags';
const SELECTED_DATE_FROM_KEY = 'popin-filter-date-from';
const SELECTED_DATE_TO_KEY = 'popin-filter-date-to';

const formatDateLabel = (dateStr: string) => {
    const [yyyy, mm, dd] = dateStr.split('-').map(Number);
    return new Date(yyyy, mm - 1, dd).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });
};

const getTodayStr = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const feedCache: { all?: EventWithDetails[] } = {};

async function queryCount(
    next3h: boolean,
    freeFood: boolean,
    dateActive: boolean,
    dateFrom: string,
    dateTo: string,
    tags: string[],
): Promise<number> {
    let query = (supabase
        .from('events')
        .select('*', { count: 'exact', head: true }) as any)
        .eq('status', 'active')
        .gte('start_time', new Date().toISOString());

    if (next3h) {
        query = query.lte('start_time', new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString());
    }
    if (dateActive) {
        const [fy, fm, fd] = dateFrom.split('-').map(Number);
        const [ty, tm, td] = dateTo.split('-').map(Number);
        query = query
            .gte('start_time', new Date(fy, fm - 1, fd, 0, 0, 0, 0).toISOString())
            .lte('start_time', new Date(ty, tm - 1, td, 23, 59, 59, 999).toISOString());
    }
    if (freeFood) {
        query = query.contains('tags', ['free_food']);
    }
    if (tags.length > 0) {
        query = query.overlaps('tags', tags);
    }

    const { count } = await query;
    return count ?? 0;
}

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
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        try {
            return (globalThis.sessionStorage?.getItem('popin-view-mode') as ViewMode) || 'list';
        } catch {
            return 'list';
        }
    });
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [eventCount, setEventCount] = useState<number | null>(null);

    // Composable filter state — all can be active simultaneously
    const [filterNext3h, setFilterNext3h] = useState(false);
    const [filterFreeFood, setFilterFreeFood] = useState(false);
    const [filterDateActive, setFilterDateActive] = useState(false);

    const [selectedDateFrom, setSelectedDateFrom] = useState<string>(() => {
        try {
            return globalThis.sessionStorage?.getItem(SELECTED_DATE_FROM_KEY) || getTodayStr();
        } catch {
            return getTodayStr();
        }
    });
    const [selectedDateTo, setSelectedDateTo] = useState<string>(() => {
        try {
            return globalThis.sessionStorage?.getItem(SELECTED_DATE_TO_KEY) || getTodayStr();
        } catch {
            return getTodayStr();
        }
    });
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

    // Refs for filter state — fetchEvents reads these so it doesn't need them as deps
    // (prevents auto-fetching when user adjusts filters inside the panel)
    const selectedFilterTagsRef = useRef(selectedFilterTags);
    const filterNext3hRef = useRef(filterNext3h);
    const filterFreeFoodRef = useRef(filterFreeFood);
    const filterDateActiveRef = useRef(filterDateActive);
    const selectedDateFromRef = useRef(selectedDateFrom);
    const selectedDateToRef = useRef(selectedDateTo);

    // Dedup guard: track event IDs that have already fired event_viewed this session
    const viewedIdsRef = useRef(new Set<string>());

    const isFilterActive = filterNext3h || filterFreeFood || filterDateActive || selectedFilterTags.length > 0;

    useEffect(() => {
        try { globalThis.sessionStorage?.setItem('popin-view-mode', viewMode); } catch {}
    }, [viewMode]);

    // Keep refs in sync with state
    useEffect(() => { filterNext3hRef.current = filterNext3h; }, [filterNext3h]);
    useEffect(() => { filterFreeFoodRef.current = filterFreeFood; }, [filterFreeFood]);
    useEffect(() => { filterDateActiveRef.current = filterDateActive; }, [filterDateActive]);
    useEffect(() => { selectedDateFromRef.current = selectedDateFrom; }, [selectedDateFrom]);
    useEffect(() => { selectedDateToRef.current = selectedDateTo; }, [selectedDateTo]);

    // Persist filter tags ref; save to sessionStorage for guests
    useEffect(() => {
        selectedFilterTagsRef.current = selectedFilterTags;
        if (userId) return;
        try {
            globalThis.sessionStorage?.setItem(
                FILTER_TAGS_SESSION_KEY,
                JSON.stringify(selectedFilterTags),
            );
        } catch {}
    }, [selectedFilterTags, userId]);

    // Persist date range to sessionStorage
    useEffect(() => {
        try { globalThis.sessionStorage?.setItem(SELECTED_DATE_FROM_KEY, selectedDateFrom); } catch {}
    }, [selectedDateFrom]);

    useEffect(() => {
        try { globalThis.sessionStorage?.setItem(SELECTED_DATE_TO_KEY, selectedDateTo); } catch {}
    }, [selectedDateTo]);

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
                if (error) { console.error(error); setInterestTags([]); return; }
                // @ts-expect-error — supabase narrows data to never when select is a string literal
                const tags = (data?.interest_tags || []).filter(Boolean);
                setInterestTags(tags);
                setSelectedFilterTags(tags);
            });

        return () => { cancelled = true; };
    }, [userId]);

    useEffect(() => {
        if (!feedOpenedFired) {
            feedOpenedFired = true;
            getPostHog().capture('feed_opened');
        }
    }, []);

    // Live event count — updates as user adjusts any filter inside the panel
    useEffect(() => {
        if (!showFilterMenu) { setEventCount(null); return; }
        queryCount(filterNext3h, filterFreeFood, filterDateActive, selectedDateFrom, selectedDateTo, selectedFilterTags)
            .then(setEventCount)
            .catch(() => setEventCount(null));
    }, [showFilterMenu, filterNext3h, filterFreeFood, filterDateActive, selectedDateFrom, selectedDateTo, selectedFilterTags]);

    const fetchEvents = useCallback(
        async (force = false) => {
            const now = new Date();
            const tags = selectedFilterTagsRef.current;
            const next3h = filterNext3hRef.current;
            const freeFood = filterFreeFoodRef.current;
            const dateActive = filterDateActiveRef.current;
            const dateFrom = selectedDateFromRef.current;
            const dateTo = selectedDateToRef.current;
            const noFilters = !next3h && !freeFood && !dateActive && tags.length === 0;

            if (!force && noFilters && feedCache.all) {
                setEvents(sortByScore(feedCache.all, now, interestTags));
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

            if (next3h) {
                query = query.lte('start_time', new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString()) as any;
            }
            if (dateActive) {
                const [fy, fm, fd] = dateFrom.split('-').map(Number);
                const [ty, tm, td] = dateTo.split('-').map(Number);
                query = (query as any)
                    .gte('start_time', new Date(fy, fm - 1, fd, 0, 0, 0, 0).toISOString())
                    .lte('start_time', new Date(ty, tm - 1, td, 23, 59, 59, 999).toISOString());
            }
            if (freeFood) {
                query = query.contains('tags', ['free_food']) as any;
            }
            if (tags.length > 0) {
                query = query.overlaps('tags', tags) as any;
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
                            ? event.event_members?.some((m: any) => m.user_id === userId)
                            : false,
                    }),
                );
                const sortedEvents = sortByScore(eventsWithDetails, now, interestTags);

                if (noFilters) {
                    feedCache.all = eventsWithDetails;
                }

                setEvents(sortedEvents);
            }

            setLoading(false);
        },
        [userId, interestTags],
    );

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    useFocusEffect(
        useCallback(() => {
            consumeFeedRefreshRequest();
            fetchEvents(true);
        }, [fetchEvents]),
    );

    const handleApplyFilters = useCallback(() => {
        setShowFilterMenu(false);
        fetchEvents(true);
    }, [fetchEvents]);

    const handleClearFilters = useCallback(() => {
        setFilterNext3h(false);
        setFilterFreeFood(false);
        setFilterDateActive(false);
        setSelectedFilterTags([]);
    }, []);

    const toggleTag = (tag: string) => {
        setSelectedFilterTags((prev) =>
            prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
        );
    };

    return (
        <View className="flex-1 bg-gray-100">
            {/* Backdrop — closes filter panel */}
            {showFilterMenu && (
                <TouchableOpacity
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
                    activeOpacity={1}
                    onPress={() => setShowFilterMenu(false)}
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
                        onPress={() => setShowFilterMenu((v) => !v)}
                        activeOpacity={0.8}
                        className="flex-row items-center rounded-full bg-white px-4 py-2.5 border border-gray-200 shadow-sm"
                    >
                        <MaterialIcons name="tune" size={16} color="#374151" style={{ marginRight: 6 }} />
                        <Text className="font-semibold text-gray-700">Filters</Text>
                        {isFilterActive && (
                            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#BB0000', marginLeft: 6 }} />
                        )}
                    </TouchableOpacity>

                    {/* Unified filter panel */}
                    {showFilterMenu && (
                        <View
                            style={{
                                position: 'absolute',
                                top: 48,
                                right: 0,
                                width: 320,
                                maxHeight: '75vh' as any,
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
                                display: 'flex' as any,
                                flexDirection: 'column',
                            }}
                        >
                            {/* Header */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>Filter by</Text>
                                {isFilterActive && (
                                    <TouchableOpacity onPress={handleClearFilters}>
                                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#BB0000' }}>Clear all</Text>
                                    </TouchableOpacity>
                                )}
                            </View>

                            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                                {/* Quick filters */}
                                <View style={{ padding: 16, paddingBottom: 12 }}>
                                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Quick filters</Text>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <TouchableOpacity
                                            onPress={() => {
                                                const next = !filterNext3h;
                                                setFilterNext3h(next);
                                                if (next) setFilterDateActive(false);
                                            }}
                                            style={{
                                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                                                backgroundColor: filterNext3h ? '#BB0000' : '#F9FAFB',
                                                borderWidth: 1, borderColor: filterNext3h ? '#BB0000' : '#E5E7EB',
                                            }}
                                        >
                                            <Text style={{ fontSize: 13, fontWeight: '600', color: filterNext3h ? 'white' : '#374151' }}>Next 3h</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => setFilterFreeFood((v) => !v)}
                                            style={{
                                                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                                                backgroundColor: filterFreeFood ? '#BB0000' : '#F9FAFB',
                                                borderWidth: 1, borderColor: filterFreeFood ? '#BB0000' : '#E5E7EB',
                                            }}
                                        >
                                            <Text style={{ fontSize: 13, fontWeight: '600', color: filterFreeFood ? 'white' : '#374151' }}>Free Food</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={{ height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 16 }} />

                                {/* Date range */}
                                <View style={{ padding: 16, paddingBottom: 12 }}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            const next = !filterDateActive;
                                            setFilterDateActive(next);
                                            if (next) setFilterNext3h(false);
                                        }}
                                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: filterDateActive ? 12 : 0 }}
                                    >
                                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            Date range
                                            {filterDateActive && selectedDateFrom === selectedDateTo
                                                ? `  ·  ${formatDateLabel(selectedDateFrom)}`
                                                : filterDateActive
                                                  ? `  ·  ${formatDateLabel(selectedDateFrom)} – ${formatDateLabel(selectedDateTo)}`
                                                  : ''}
                                        </Text>
                                        {/* Toggle pill */}
                                        <View style={{
                                            width: 36, height: 20, borderRadius: 10,
                                            backgroundColor: filterDateActive ? '#BB0000' : '#D1D5DB',
                                            justifyContent: 'center', paddingHorizontal: 2,
                                        }}>
                                            <View style={{
                                                width: 16, height: 16, borderRadius: 8, backgroundColor: 'white',
                                                alignSelf: filterDateActive ? 'flex-end' : 'flex-start',
                                            }} />
                                        </View>
                                    </TouchableOpacity>

                                    {filterDateActive && (
                                        <View style={{ gap: 10 }}>
                                            <View>
                                                <Text style={{ fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>From</Text>
                                                {/* @ts-ignore — raw HTML input, safe in web-only app */}
                                                <input
                                                    type="date"
                                                    value={selectedDateFrom}
                                                    min={getTodayStr()}
                                                    onChange={(e: any) => {
                                                        const val = e.target.value;
                                                        setSelectedDateFrom(val);
                                                        if (val > selectedDateTo) setSelectedDateTo(val);
                                                    }}
                                                    style={{ fontSize: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB', width: '100%', outline: 'none', color: '#111827', boxSizing: 'border-box' }}
                                                />
                                            </View>
                                            <View>
                                                <Text style={{ fontSize: 11, fontWeight: '600', color: '#9CA3AF', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>To</Text>
                                                {/* @ts-ignore — raw HTML input, safe in web-only app */}
                                                <input
                                                    type="date"
                                                    value={selectedDateTo}
                                                    min={selectedDateFrom}
                                                    onChange={(e: any) => setSelectedDateTo(e.target.value)}
                                                    style={{ fontSize: 14, padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB', width: '100%', outline: 'none', color: '#111827', boxSizing: 'border-box' }}
                                                />
                                            </View>
                                        </View>
                                    )}
                                </View>

                                <View style={{ height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 16 }} />

                                {/* Interests */}
                                <View style={{ padding: 16 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                            Interests{selectedFilterTags.length > 0 ? `  ·  ${selectedFilterTags.length} selected` : ''}
                                        </Text>
                                        {selectedFilterTags.length > 0 && (
                                            <TouchableOpacity onPress={() => setSelectedFilterTags([])}>
                                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#BB0000' }}>Clear</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                        {EVENT_TAGS.map((tag) => {
                                            const isSelected = selectedFilterTags.includes(tag);
                                            const tagColor = getTagColor(tag);
                                            return (
                                                <TouchableOpacity
                                                    key={tag}
                                                    onPress={() => toggleTag(tag)}
                                                    style={{
                                                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
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
                                </View>
                            </ScrollView>

                            {/* Footer CTA — single "Show X events" for all combined filters */}
                            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' }}>
                                <TouchableOpacity
                                    onPress={handleApplyFilters}
                                    style={{ backgroundColor: '#BB0000', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                                >
                                    <Text style={{ color: 'white', fontWeight: '700', fontSize: 14 }}>
                                        {eventCount === null ? 'Show events' : `Show ${eventCount} event${eventCount !== 1 ? 's' : ''}`}
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
                            <Text className="text-gray-500 text-lg">No events found</Text>
                            <Text className="text-gray-400 mt-2">
                                {isFilterActive ? 'Try adjusting your filters' : 'Check back later'}
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