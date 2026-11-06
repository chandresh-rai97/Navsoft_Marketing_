import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { DialogProvider } from "./components/Dialog.jsx";
import { AppDataProvider } from "./context/AppData.jsx";
import OfflineScreen from "./components/OfflineScreen.jsx";
import { trackKeyboard } from "./lib/keyboard.js";

trackKeyboard();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DialogProvider>
      <AppDataProvider>
        <App />
        <OfflineScreen />
      </AppDataProvider>
    </DialogProvider>
  </React.StrictMode>
);

// Installable app: the service worker caches the app's own files only (built
// as dist/sw.js). updateViaCache "none" makes each open check for a new deploy.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  });
}
