import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { EventWithDetails } from 'shared';
import { formatTagLabel, getTagColor } from 'shared';
import { Linking } from 'react-native';
import { resolveEventLocation } from '../lib/geocode';
import { supabase } from '../lib/supabase';
import { loadGoogleMaps } from '../lib/googleMaps';
import MapEventSheet from './MapEventSheet';

const CONTAINER_ID = 'popin-google-map-container';
const OSU_CENTER = { lat: 39.9996305361392, lng: -83.0126973595988 };

interface Props {
    events: EventWithDetails[];
}

export default function MapView({ events }: Props) {
    const mapRef = useRef<any>(null);
    const googleRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const clustererRef = useRef<any>(null);
    const infoWindowRef = useRef<any>(null);
    // Cached library refs — loaded once during map init, reused on every pins render
    const markerLibRef = useRef<any>(null);
    const MarkerClustererRef = useRef<any>(null);
    const [mapReady, setMapReady] = useState(false);
    const [mapError, setMapError] = useState(false);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [sheetEvents, setSheetEvents] = useState<EventWithDetails[]>([]);
    const [selectedEvent, setSelectedEvent] = useState<EventWithDetails | null>(null);
    const [panelLoading, setPanelLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setUserId(data.user?.id || null);
        });
    }, []);

    // Initialize Google Maps
    useEffect(() => {
        let destroyed = false;

        (async () => {
            if (!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) {
                setMapError(true);
                return;
            }

            try {
                const google = await loadGoogleMaps();
                if (destroyed) return;

                googleRef.current = google;

                const container = document.getElementById(CONTAINER_ID);
                if (!container) return;

                const map = new google.maps.Map(container, {
                    center: OSU_CENTER,
                    zoom: 15,
                    // DEMO_MAP_ID enables Advanced Markers.
                    // Replace with a real Map ID from Google Cloud Console for production.
                    mapId: 'DEMO_MAP_ID',
                    disableDefaultUI: true,
                    mapTypeControl: true,
                    fullscreenControl: true,
                    // Push Google's built-in controls (zoom, fullscreen) above the nav bar
                    padding: { bottom: 72 },
                });

                mapRef.current = map;
                infoWindowRef.current = new google.maps.InfoWindow();

                // Pre-warm marker libs in parallel so the pins effect has them cached
                Promise.all([
                    google.maps.importLibrary('marker').then((lib: any) => { markerLibRef.current = lib; }),
                    import('@googlemaps/markerclusterer').then(({ MarkerClusterer }) => { MarkerClustererRef.current = MarkerClusterer; }),
                ]).catch(() => {});

                setMapReady(true);

                // Attempt silent geolocation on load (works on HTTPS / localhost).
                // On HTTP local network it will fail silently — the button is always
                // visible and re-requests location when tapped.
                navigator.geolocation.getCurrentPosition(
                    ({ coords }) => {
                        if (destroyed) return;
                        const loc = { lat: coords.latitude, lng: coords.longitude };
                        setUserLocation(loc);
                        map.panTo(loc);
                        placeUserPin(loc, false);
                    },
                    () => { /* silently ignore — button tap will retry */ },
                    { maximumAge: 30000, timeout: 10000, enableHighAccuracy: false },
                );
            } catch (err) {
                console.error('[MapView] Failed to load Google Maps:', err);
                if (!destroyed) setMapError(true);
            }
        })();

        return () => {
            destroyed = true;
            markersRef.current.forEach((m) => m.setMap(null));
            markersRef.current = [];
            mapRef.current = null;
            googleRef.current = null;
            setMapReady(false);
        };
    }, []);

    // Place event pins whenever events change or map becomes ready
    useEffect(() => {
        if (!mapReady || !mapRef.current || !googleRef.current) return;

        const map = mapRef.current;
        const google = googleRef.current;
        const iw = infoWindowRef.current;

        // Clear previous clusterer (removes all managed markers from the map)
        clustererRef.current?.clearMarkers();
        clustererRef.current = null;
        markersRef.current = [];

        let cancelled = false;

        (async () => {
            const ONLINE_KEYWORDS = /\b(zoom|teams|webinar|online|virtual|remote)\b/i;

            const onlineFiltered = events.filter(e => e.location_text && ONLINE_KEYWORDS.test(e.location_text));
            if (onlineFiltered.length > 0) {
                console.log('[MapView] Skipped (online/virtual):', onlineFiltered.map(e => `"${e.title}" — ${e.location_text}`));
            }

            const eventsToPlace = events.filter(e =>
                !(e.location_text && ONLINE_KEYWORDS.test(e.location_text)),
            );
            const needsGeocoding = eventsToPlace
                .filter(e => e.location_lat == null && e.location_lng == null && e.location_text)
                .map(e => e.location_text!);

            // Step 1 — run lib imports + geocode_cache fetch all in parallel
            const [markerLib, { MarkerClusterer }, geocacheResult] = await Promise.all([
                markerLibRef.current
                    ? Promise.resolve(markerLibRef.current)
                    : google.maps.importLibrary('marker').then((lib: any) => { markerLibRef.current = lib; return lib; }),
                MarkerClustererRef.current
                    ? Promise.resolve({ MarkerClusterer: MarkerClustererRef.current })
                    : import('@googlemaps/markerclusterer').then(m => { MarkerClustererRef.current = m.MarkerClusterer; return m; }),
                needsGeocoding.length > 0
                    ? supabase.from('geocode_cache').select('address, lat, lng').in('address', needsGeocoding)
                    : Promise.resolve({ data: [] as { address: string; lat: number; lng: number }[] }),
            ]);
            if (cancelled) return;

            const geocacheMap = new Map<string, { lat: number; lng: number }>();
            for (const row of (geocacheResult.data ?? [])) {
                geocacheMap.set(row.address, { lat: row.lat, lng: row.lng });
            }

            // Step 2 — resolve all positions in parallel (cache misses geocode concurrently)
            const positionResults = await Promise.allSettled(
                eventsToPlace.map(async (event) => {
                    if (event.location_lat != null && event.location_lng != null) {
                        return { event, position: { lat: event.location_lat, lng: event.location_lng } };
                    }
                    if (!event.location_text) return null;
                    const position = geocacheMap.get(event.location_text) ?? await resolveEventLocation(event.location_text);
                    return position ? { event, position } : null;
                }),
            );
            if (cancelled) return;

            // Log events that failed to resolve a position
            positionResults.forEach((r, i) => {
                const event = eventsToPlace[i];
                if (r.status === 'rejected') {
                    console.log(`[MapView] Failed (geocode error): "${event.title}" — ${event.location_text ?? '(no location)'}`, r.reason);
                } else if (r.value === null) {
                    console.log(`[MapView] Failed (no position): "${event.title}" — ${event.location_text ?? '(no location_text)'}`);
                }
            });

            const resolved = positionResults
                .filter((r): r is PromiseFulfilledResult<{ event: EventWithDetails; position: { lat: number; lng: number } }> =>
                    r.status === 'fulfilled' && r.value !== null)
                .map(r => r.value);

            console.log(`[MapView] Rendering ${resolved.length}/${events.length} events on map`);

            // Step 2 — group events within 150m of each other as the same location.
            // Places autocomplete and Geocoding API return different coordinates for the
            // same named building (can differ by ~100m), so exact or rounded key matching
            // would create duplicate pins.
            const locationGroups: { position: { lat: number; lng: number }; events: EventWithDetails[] }[] = [];
            const metersPerDegLat = 111320;
            for (const { event, position } of resolved) {
                const existing = locationGroups.find(({ position: p }) => {
                    const dLat = (position.lat - p.lat) * metersPerDegLat;
                    const dLng = (position.lng - p.lng) * metersPerDegLat * Math.cos(p.lat * Math.PI / 180);
                    return Math.sqrt(dLat * dLat + dLng * dLng) < 150;
                });
                if (existing) {
                    existing.events.push(event);
                } else {
                    locationGroups.push({ position, events: [event] });
                }
            }

            // Step 3 — one AdvancedMarkerElement per unique location
            const newMarkers: any[] = [];
            for (const { position, events: locEvents } of locationGroups) {
                if (cancelled) break;

                const count = locEvents.length;

                const pin = new markerLib.PinElement({
                    background: '#BB0000',
                    borderColor: '#800000',
                    glyphColor: 'white',
                    glyphText: count <= 9 ? String(count) : '9+',
                });

                // No `map` — MarkerClusterer manages assignment
                const marker = new markerLib.AdvancedMarkerElement({
                    position,
                    content: pin.element,
                    title: count === 1 ? locEvents[0].title : `${count} events`,
                });
                // Store all events at this location for cluster click handler
                (marker as any).__events = locEvents;

                if (count === 1) {
                    const event = locEvents[0];
                    const infoContent =
                        `<div style="font-family:sans-serif;min-width:160px;padding:2px 0">` +
                        `<strong style="font-size:13px">${event.title}</strong>` +
                        `<div style="font-size:11px;color:#555;margin-top:4px">${new Date(event.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>` +
                        `<div style="font-size:11px;color:#888;margin-top:2px">${event.attendee_count ?? 0} attending · click for details</div>` +
                        `</div>`;

                    pin.element.addEventListener('mouseenter', () => {
                        iw.setContent(infoContent);
                        iw.open({ anchor: marker, map });
                    });
                    pin.element.addEventListener('mouseleave', () => iw.close());
                    marker.addListener('click', () => { iw.close(); openPanel(event); });
                } else {
                    // Badged pin — click opens bottom sheet
                    marker.addListener('click', () => setSheetEvents(locEvents));
                }

                newMarkers.push(marker);
            }

            if (!cancelled) {
                markersRef.current = newMarkers;
                clustererRef.current = new MarkerClusterer({
                    map,
                    markers: newMarkers,
                    // Custom renderer: show total event count, not marker count
                    renderer: {
                        render: ({ markers: clusterMarkers, position }: any) => {
                            const totalEvents = (clusterMarkers ?? [])
                                .reduce((sum: number, m: any) => sum + (m.__events?.length ?? 1), 0);
                            const label = totalEvents <= 9 ? String(totalEvents) : '9+';
                            const el = document.createElement('div');
                            el.style.cssText = `
                                background:#BB0000;border:2px solid #800000;border-radius:50%;
                                color:white;font-size:13px;font-weight:700;
                                width:36px;height:36px;display:flex;align-items:center;justify-content:center;
                                cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.3);
                            `;
                            el.textContent = label;
                            return new markerLib.AdvancedMarkerElement({ position, content: el });
                        },
                    },
                    // Cluster click: flatten __events from all markers in the cluster
                    onClusterClick: (_e, cluster) => {
                        const clusterEvents = (cluster.markers ?? [])
                            .flatMap((m: any) => (m.__events ?? []) as EventWithDetails[]);
                        if (clusterEvents.length === 1) {
                            openPanel(clusterEvents[0]);
                        } else {
                            setSheetEvents(clusterEvents);
                        }
                    },
                });
            }
        })();

        return () => { cancelled = true; };
    }, [events, mapReady]);

    const openPanel = async (event: EventWithDetails) => {
        setSelectedEvent(event);
        setPanelLoading(true);

        const { data } = (await supabase
            .from('events')
            .select(`*, host:profiles!events_host_id_fkey(id, email, display_name), event_members(user_id)`)
            .eq('id', event.id)
            .single()) as any;

        if (data) {
            const uid = (await supabase.auth.getUser()).data.user?.id || null;
            setSelectedEvent({
                ...data,
                host: data.host,
                attendee_count: data.event_members?.length || 0,
                is_joined: uid ? data.event_members?.some((m: any) => m.user_id === uid) : false,
            });
        }
        setPanelLoading(false);
    };

    const handleJoin = async () => {
        if (!selectedEvent || !userId) return;
        setActionLoading(true);
        // @ts-expect-error - Supabase type inference issue
        await supabase.from('event_members').insert({ event_id: selectedEvent.id, user_id: userId });
        setActionLoading(false);
        openPanel(selectedEvent);
    };

    const handleLeave = async () => {
        if (!selectedEvent || !userId) return;
        setActionLoading(true);
        await supabase.from('event_members').delete()
            .eq('event_id', selectedEvent.id)
            .eq('user_id', userId);
        setActionLoading(false);
        openPanel(selectedEvent);
    };

    const userPinRef = useRef<any>(null);

    const placeUserPin = (loc: { lat: number; lng: number }, panTo = true) => {
        const map = mapRef.current;
        if (!map || !googleRef.current) return;
        if (panTo) { map.panTo(loc); map.setZoom(16); }
        googleRef.current.maps.importLibrary('marker').then((markerLib: any) => {
            if (userPinRef.current) {
                userPinRef.current.position = loc;
            } else {
                const pin = new markerLib.PinElement({
                    background: '#4287f5',
                    borderColor: '#2d6ad6',
                    glyphColor: '#fff',
                });
                userPinRef.current = new markerLib.AdvancedMarkerElement({
                    position: loc,
                    map,
                    content: pin.element,
                    title: 'You are here',
                });
            }
        });
    };

    const goToMyLocation = () => {
        if (!mapRef.current) return;

        if (userLocation) {
            placeUserPin(userLocation);
        } else {
            navigator.geolocation.getCurrentPosition(
                ({ coords }) => {
                    const loc = { lat: coords.latitude, lng: coords.longitude };
                    setUserLocation(loc);
                    placeUserPin(loc);
                },
                (err) => console.error('Geolocation error:', err.code, err.message),
                { maximumAge: 30000, timeout: 10000, enableHighAccuracy: false },
            );
        }
    };

    const isHost = selectedEvent && userId && userId === selectedEvent.host_id;
    const isFull = selectedEvent?.capacity != null && (selectedEvent.attendee_count ?? 0) >= selectedEvent.capacity;

    if (mapError) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' }}>
                <Text style={{ color: '#6b7280', fontSize: 15 }}>Map unavailable — missing Google Maps API key.</Text>
            </View>
        );
    }

    return (
        <View style={{ height: 'calc(100dvh - 72px)' as any, width: '100%', position: 'relative' }}>
            {/* Map container */}
            <View
                nativeID={CONTAINER_ID}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            />

            {/* Loading overlay */}
            {!mapReady && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' }}>
                    <ActivityIndicator size="large" color="#BB0000" />
                </View>
            )}

            {/* Locate me button — always visible; tapping requests location if not yet granted */}
            {mapReady && (
                <TouchableOpacity
                    onPress={goToMyLocation}
                    style={{
                        position: 'absolute',
                        bottom: 120,
                        right: 10,
                        backgroundColor: '#fff',
                        borderRadius: 50,
                        width: 40,
                        height: 40,
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.25,
                        shadowRadius: 4,
                        elevation: 4,
                        zIndex: 9999,
                    } as any}
                >
                    <MaterialIcons name="my-location" size={22} color="#4285F4" />
                </TouchableOpacity>
            )}

            {/* Cluster bottom sheet */}
            {sheetEvents.length > 0 && (
                <MapEventSheet
                    events={sheetEvents}
                    onClose={() => setSheetEvents([])}
                    onSelectEvent={(event) => {
                        setSheetEvents([]);
                        openPanel(event);
                    }}
                />
            )}

            {/* Event detail side panel */}
            {selectedEvent && (
                <View style={{
                    position: 'absolute', top: 0, right: 0, bottom: 0,
                    width: typeof window !== 'undefined' && window.innerWidth < 768 ? '100%' : 320,
                    backgroundColor: '#fff', zIndex: 20,
                    shadowColor: '#000', shadowOffset: { width: -2, height: 0 },
                    shadowOpacity: 0.15, shadowRadius: 10, elevation: 8,
                }}>
                    <TouchableOpacity
                        onPress={() => setSelectedEvent(null)}
                        style={{ position: 'absolute', top: 14, right: 14, zIndex: 30, padding: 6 }}
                    >
                        <Text style={{ fontSize: 18, color: '#9ca3af' }}>✕</Text>
                    </TouchableOpacity>

                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 92 }}>
                        {panelLoading ? (
                            <ActivityIndicator size="large" color="#BB0000" style={{ marginTop: 80 }} />
                        ) : (
                            <>
                                <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 20, marginRight: 28, lineHeight: 28 }}>
                                    {selectedEvent.title}
                                </Text>

                                <View style={{ gap: 16, marginBottom: 24 }}>
                                    <View>
                                        <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>📅 When</Text>
                                        <Text style={{ fontSize: 14, color: '#111827' }}>
                                            {new Date(selectedEvent.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                        </Text>
                                    </View>
                                    <View>
                                        <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>📍 Where</Text>
                                        <Text style={{ fontSize: 14, color: '#111827' }}>{selectedEvent.location_text}</Text>
                                    </View>
                                    <View>
                                        <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>👥 Attending</Text>
                                        <Text style={{ fontSize: 14, color: '#111827' }}>
                                            {selectedEvent.attendee_count ?? 0}
                                            {selectedEvent.capacity != null ? ` / ${selectedEvent.capacity}` : ''} people
                                            {isFull && <Text style={{ color: '#BB0000', fontWeight: '600' }}> · FULL</Text>}
                                        </Text>
                                    </View>
                                    {selectedEvent.host && (
                                        <View>
                                            <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>🎯 Host</Text>
                                            <Text style={{ fontSize: 14, color: '#BB0000', fontWeight: '600' }}>
                                                {selectedEvent.host.display_name || selectedEvent.host.email?.split('@')[0]}
                                            </Text>
                                        </View>
                                    )}
                                    {selectedEvent.description ? (
                                        <View>
                                            <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>📝 About</Text>
                                            <Text style={{ fontSize: 14, color: '#374151', lineHeight: 22 }}>{selectedEvent.description}</Text>
                                        </View>
                                    ) : null}
                                    {selectedEvent.tags && selectedEvent.tags.length > 0 && (
                                        <View>
                                            <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>🏷️ Tags</Text>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                                {selectedEvent.tags.map((tag) => {
                                                    const { backgroundColor, textColor } = getTagColor(tag);
                                                    return (
                                                        <View key={tag} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor }}>
                                                            <Text style={{ fontSize: 12, color: textColor }}>{formatTagLabel(tag)}</Text>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    )}
                                    {selectedEvent.source_url ? (
                                        <View>
                                            <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>🔗 Link</Text>
                                            <TouchableOpacity
                                                onPress={() => {
                                                    const url = selectedEvent.source_url!.startsWith('http') ? selectedEvent.source_url! : `https://${selectedEvent.source_url}`;
                                                    Linking.openURL(url);
                                                }}
                                                activeOpacity={0.7}
                                            >
                                                <Text style={{ fontSize: 14, color: '#BB0000', fontWeight: '500', textDecorationLine: 'underline' }} numberOfLines={1}>
                                                    {selectedEvent.source_url}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : null}
                                </View>

                                <View style={{ height: 1, backgroundColor: '#f3f4f6', marginBottom: 20 }} />

                                {isHost ? (
                                    <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>You are hosting this event</Text>
                                ) : (
                                    <>
                                        <TouchableOpacity
                                            onPress={selectedEvent.is_joined ? handleLeave : handleJoin}
                                            disabled={actionLoading || (!selectedEvent.is_joined && !!isFull)}
                                            style={{
                                                backgroundColor: selectedEvent.is_joined ? '#fff' : '#BB0000',
                                                borderRadius: 12, paddingVertical: 14, alignItems: 'center',
                                                borderWidth: 1,
                                                borderColor: selectedEvent.is_joined ? '#D1D5DB' : '#A50000',
                                                opacity: actionLoading || (!selectedEvent.is_joined && !!isFull) ? 0.5 : 1,
                                            }}
                                        >
                                            {actionLoading ? (
                                                <ActivityIndicator color={selectedEvent.is_joined ? '#6B7280' : '#fff'} />
                                            ) : (
                                                <Text style={{ color: selectedEvent.is_joined ? '#374151' : '#fff', fontWeight: '600', fontSize: 15 }}>
                                                    {selectedEvent.is_joined ? 'Leave Event' : isFull ? 'Event Full' : 'Join Event'}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                        {selectedEvent.is_joined && (
                                            <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>You can leave anytime</Text>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}
