import { signal } from "@preact/signals";
import { useEffect } from "react";

// Mobile breakpoint shared with app/globals.css (max-width: 640px).
const MOBILE_QUERY = "(max-width: 640px)";

function getIsMobile(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

export const isMobileSignal = signal<boolean>(getIsMobile());

if (typeof window !== "undefined" && window.matchMedia) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", (e) => {
    isMobileSignal.value = e.matches;
  });
}

/**
 * Returns true when the viewport is at or below the mobile breakpoint.
 */
export function useIsMobile(): boolean {
  useEffect(() => {
    // Sync initially on mount if needed
    isMobileSignal.value = getIsMobile();
  }, []);
  return isMobileSignal.value;
}
