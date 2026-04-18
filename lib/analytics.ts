type AnalyticsPayload = {
  eventName: string;
  metadata?: Record<string, unknown>;
};

export function trackClientEvent(payload: AnalyticsPayload) {
  if (typeof window === "undefined") {
    return;
  }

  const endpoint = "/api/analytics";
  const body = JSON.stringify({
    ...payload,
    timestamp: new Date().toISOString(),
    userAgent: window.navigator.userAgent
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
      return;
    }

    void fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body
    });
  } catch {
    // noop: analytics should never block UX
  }
}
