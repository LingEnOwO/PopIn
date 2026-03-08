import { useRef, useEffect } from "react";
import { View } from "react-native";

interface VisibilityTrackerProps {
  onVisible: () => void;
  children: React.ReactNode;
  /** Fraction of the element that must be visible (default 0.5 = 50%) */
  threshold?: number;
  /** How long the element must stay visible before firing (ms, default 500) */
  dwellMs?: number;
}

/**
 * Wraps children and fires `onVisible` once when the element has been
 * ≥`threshold` visible for at least `dwellMs` milliseconds.
 * Uses IntersectionObserver (web-only). On environments without the API
 * (SSR / older browsers) the callback is simply never fired.
 */
export function VisibilityTracker({
  onVisible,
  children,
  threshold = 0.5,
  dwellMs = 1000,
}: VisibilityTrackerProps) {
  const viewRef = useRef<View>(null);
  // Prevent firing more than once per component instance
  const firedRef = useRef(false);
  // Keep latest callback without re-running the effect
  const onVisibleRef = useRef(onVisible);
  useEffect(() => {
    onVisibleRef.current = onVisible;
  });

  useEffect(() => {
    const node = viewRef.current as unknown as Element | null;
    if (!node || typeof IntersectionObserver === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !firedRef.current) {
          timer = setTimeout(() => {
            if (!firedRef.current) {
              firedRef.current = true;
              onVisibleRef.current();
            }
          }, dwellMs);
        } else {
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
        }
      },
      { threshold },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (timer !== null) clearTimeout(timer);
    };
    // threshold and dwellMs are expected to be stable; onVisible is handled via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, dwellMs]);

  return <View ref={viewRef}>{children}</View>;
}
