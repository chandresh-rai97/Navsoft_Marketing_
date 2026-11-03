import React, { useEffect, useState } from "react";

// Full-screen notice while the device is offline (data can't be loaded).
// Disappears by itself when the connection comes back.
export default function OfflineScreen() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine !== false);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  if (online) return null;
  return (
    <div className="offline-screen" role="alert">
      <div>
        <img src="/icons/icon-192.png" alt="" width="72" height="72" />
        <h1>You’re offline</h1>
        <p>Reconnect to see the latest data.</p>
      </div>
    </div>
  );
}
