/** Translate `key`, falling back to the English `fallback` text (no dictionaries are shipped). */
export function t(key: string, fallback?: string): string {
  if (fallback !== undefined) return fallback;
  const parts = key.split(".");
  return parts[parts.length - 1] || key;
}

const defaultI18n = {
  t,
  language: "en" as const,
  setLanguage: () => {},
};

export function useI18n() {
  return defaultI18n;
}

export default useI18n;
