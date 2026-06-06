/**
 * _useResumeRefresh.ts
 *
 * Handles PWA/WebView "resume from background" stale-state recovery.
 *
 * WHY THIS EXISTS
 * ---------------
 * On mobile (iOS Safari PWA, Android Chrome), after 3-4 hours idle the OS
 * freezes the WebView. When the user reopens the app, React resumes from
 * its frozen state with `loading: true`, but the in-flight Supabase fetch
 * was killed by the OS. Nothing ever resolves it → permanent skeleton screen.
 *
 * HOW TO REMOVE THIS ENTIRELY (if it causes problems)
 * ----------------------------------------------------
 * 1. Delete this file  (app/shop/_useResumeRefresh.ts)
 * 2. In app/shop/page.tsx remove:
 *    - the import line for useResumeRefresh / useLoadingTimeout
 *    - the useResumeRefresh(...) call
 *    - the useLoadingTimeout(...) call
 * That's it — no other code is touched.
 */

import { useEffect, useRef } from "react";

/** How long the app must be hidden before we treat the resume as "stale". */
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Calls `onResume` when the page becomes visible again after being hidden
 * for longer than STALE_THRESHOLD_MS (default 5 min).
 */
export function useResumeRefresh(onResume: () => void) {
  // Keep ref so the callback never causes the effect to re-run
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;

  useEffect(() => {
    let hiddenAt = 0;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else {
        if (hiddenAt > 0 && Date.now() - hiddenAt > STALE_THRESHOLD_MS) {
          onResumeRef.current();
        }
        hiddenAt = 0;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []); // intentionally empty — never re-runs
}

/**
 * Safety net: if `loading` is still true after `timeoutMs` (default 12 s),
 * calls `onTimeout`. Prevents a permanently stuck skeleton if visibilitychange
 * fires in an unexpected order or the fetch hangs for another reason.
 */
export function useLoadingTimeout(
  loading: boolean,
  onTimeout: () => void,
  timeoutMs = 12_000
) {
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => onTimeoutRef.current(), timeoutMs);
    return () => clearTimeout(t);
  }, [loading, timeoutMs]);
}
