import { signal, computed } from "@preact/signals";
import { useCallback } from "react";

export type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export const themeSignal = signal<Theme>(getInitialTheme());
export const isDarkSignal = computed(() => themeSignal.value === "dark");

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function applyDocumentTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  themeSignal.value = theme;
}

let systemThemeFollowStarted = false;

/** Follow OS theme when the user has not forced a preference. Starts once per page. */
function startSystemThemeFollow(): void {
  if (systemThemeFollowStarted || typeof window === "undefined") return;
  systemThemeFollowStarted = true;
  const storedTheme = (): string | null => {
    try {
      return localStorage.getItem("pi-theme");
    } catch {
      return null;
    }
  };
  if (storedTheme() === "light" || storedTheme() === "dark") return;
  const applySystem = () => {
    const stored = storedTheme();
    if (stored === "light" || stored === "dark") return;
    const dark = systemPrefersDark();
    applyDocumentTheme(dark ? "dark" : "light");
  };
  applySystem();
  window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", applySystem);
}

type ToggleOrigin = { x: number; y: number };

export function useTheme() {
  const theme = themeSignal.value;

  startSystemThemeFollow();

  const toggleTheme = useCallback((origin?: ToggleOrigin) => {
    const next: Theme = themeSignal.value === "dark" ? "light" : "dark";

    const apply = () => {
      applyDocumentTheme(next);
      try {
        localStorage.setItem("pi-theme", next);
      } catch {
        // ignore storage errors (private mode, quota, etc.)
      }
    };

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const supportsVT = typeof document.startViewTransition === "function";

    if (!supportsVT || reduceMotion) {
      apply();
      return;
    }

    const x = origin?.x ?? window.innerWidth / 2;
    const y = origin?.y ?? window.innerHeight / 2;
    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

    const transition = document.startViewTransition(apply);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
          },
          {
            duration: 450,
            easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        );
      })
      .catch(() => {
        // transition cancelled — ignore
      });
  }, []);

  return { theme, toggleTheme, isDark: isDarkSignal.value };
}
