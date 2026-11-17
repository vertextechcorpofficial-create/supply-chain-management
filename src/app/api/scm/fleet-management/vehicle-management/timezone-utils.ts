const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

let cachedTimezone: string | null = null;

function directusHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (DIRECTUS_TOKEN) h.Authorization = `Bearer ${DIRECTUS_TOKEN}`;
  return h;
}

/**
 * Fetches time_zone setting from general_setting table, caching it in memory.
 */
export async function fetchDatabaseTimezone(): Promise<string> {
  if (cachedTimezone) return cachedTimezone;
  try {
    const res = await fetch(
      `${DIRECTUS_URL}/items/general_setting?filter[setting_key][_eq]=time_zone&limit=1`,
      {
        headers: directusHeaders(),
        cache: "no-store",
      }
    );
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      const setting = json?.data?.[0];
      const val = setting?.setting_value;
      if (typeof val === "string" && val.trim().length > 0) {
        const tz = val.trim();
        cachedTimezone = tz;
        return tz;
      }
    }
  } catch {
    // fallback
  }
  return "Asia/Manila";
}

/**
 * Returns current timestamp formatted for MySQL datetime / ISO in the configured timezone.
 * Format: "YYYY-MM-DDTHH:mm:ss"
 */
export async function getFormattedDbNow(): Promise<string> {
  const tz = await fetchDatabaseTimezone();
  return new Date()
    .toLocaleString("sv-SE", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    .replace(" ", "T");
}

/**
 * Returns YYYYMMDD string in the configured database timezone for code generation (e.g. JO numbers).
 */
export async function getDbDatePart(): Promise<string> {
  const tz = await fetchDatabaseTimezone();
  return new Date()
    .toLocaleString("sv-SE", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/-/g, "");
}

