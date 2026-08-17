"use client";

import { useEffect, useState } from "react";

type LocationData = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export default function Home() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState<string>("");
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    if (!watching) return;

    if (!navigator.geolocation) {
      setError("Geolocation is not supported on this device.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setError("");
      },
      (err) => {
        setError(err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [watching]);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "32px 20px",
        maxWidth: "600px",
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <p style={{ fontSize: "14px", marginBottom: "8px" }}>BETWEEN STOPS</p>

      <h1 style={{ fontSize: "36px", marginBottom: "8px" }}>
        Location Test
      </h1>

      <p style={{ marginBottom: "32px" }}>
        First test of live passenger location.
      </p>

      {!watching && (
        <button
          onClick={() => setWatching(true)}
          style={{
            padding: "14px 20px",
            fontSize: "18px",
            cursor: "pointer",
          }}
        >
          Start GPS
        </button>
      )}

      {watching && (
        <div style={{ marginTop: "24px" }}>
          <p>● GPS ACTIVE</p>

          {location ? (
            <>
              <p>
                <strong>Latitude:</strong> {location.latitude.toFixed(6)}
              </p>
              <p>
                <strong>Longitude:</strong> {location.longitude.toFixed(6)}
              </p>
              <p>
                <strong>Accuracy:</strong> ±{Math.round(location.accuracy)} metres
              </p>
            </>
          ) : (
            <p>Waiting for location...</p>
          )}
        </div>
      )}

      {error && (
        <p style={{ marginTop: "24px" }}>
          <strong>GPS error:</strong> {error}
        </p>
      )}
    </main>
  );
}