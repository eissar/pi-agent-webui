export function t(key: string, _params?: Record<string, string | number>): string {
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
