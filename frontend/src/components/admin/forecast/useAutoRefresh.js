// WHAT: Keeps the Forecasting page current without the admin doing anything.
// WHY: production records arrive monthly and a forecast is a snapshot, so the
//      page does not need a fast poll. It refreshes when the admin comes back
//      to the tab (the case that matters) and once a week as a safety net for
//      a screen that stays open and untouched.
import { useCallback, useEffect, useRef, useState } from 'react';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FOCUS_MIN_AGE_MS = 60 * 1000;
const MIN_GAP_MS = 30 * 1000;

export default function useAutoRefresh(onRefresh, { pollMs = WEEK_MS } = {}) {
  const [lastUpdated, setLastUpdated] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const lastRun = useRef(Date.now());
  const running = useRef(false);
  const callback = useRef(onRefresh);
  callback.current = onRefresh;

  const refresh = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRun.current < MIN_GAP_MS) return;
    if (running.current) return;
    running.current = true;
    setRefreshing(true);
    try {
      await callback.current();
      lastRun.current = Date.now();
      setLastUpdated(lastRun.current);
    } finally {
      running.current = false;
      setRefreshing(false);
    }
  }, []);

  // Weekly safety net, only while the tab is actually visible.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      refresh();
    }, pollMs);
    return () => clearInterval(timer);
  }, [pollMs, refresh]);

  // The admin comes back to the tab -> show the current numbers.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRun.current < FOCUS_MIN_AGE_MS) return;
      refresh();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { lastUpdated, refreshing, refresh: () => refresh(true) };
}
