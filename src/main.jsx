import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { DialogProvider } from "./components/Dialog.jsx";
import { AppDataProvider } from "./context/AppData.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DialogProvider>
      <AppDataProvider>
        <App />
      </AppDataProvider>
    </DialogProvider>
  </React.StrictMode>
);
