import type { Insights, SessionDetail, SessionSummary } from "@/types/api";

const API_BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:3001";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API request to ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function getSessions(deviceId?: string): Promise<SessionSummary[]> {
  const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
  const data = await fetchJson<{ sessions: SessionSummary[] }>(`/v1/sessions${query}`);
  return data.sessions;
}

export async function getSession(id: string): Promise<SessionDetail | null> {
  const res = await fetch(`${API_BASE_URL}/v1/sessions/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API request to /v1/sessions/${id} failed: ${res.status}`);
  return (await res.json()) as SessionDetail;
}

export async function getInsights(deviceId?: string): Promise<Insights> {
  const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
  return fetchJson<Insights>(`/v1/insights${query}`);
}
