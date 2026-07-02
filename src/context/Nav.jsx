import { createContext, useContext } from "react";

// Lightweight in-app router: current view key + an optional argument (e.g. a KR
// id to drill into), and a navigate(view, arg) function. Mirrors go(view, arg).
export const NavContext = createContext({ view: "myday", arg: null, navigate: () => {} });
export const useNav = () => useContext(NavContext);
