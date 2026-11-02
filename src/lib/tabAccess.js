// Per-tab access for the two tabs that have it: Campaigns and HubSpot Team
// Activity. Grants live in tab_access (by role or by user); the database
// function can_view_tab() is the source of truth and also guards the data
// (RLS) and the on-demand refresh (Edge Functions). Admins always have access.
import { supabase } from "./supabase.js";
import { canSeeCampaigns } from "./instantly.js";

// Sidebar / route key → tab_access.tab_key
export const GATED_TABS = { campaigns: "campaigns", hubspot: "hubspot_team_activity" };

// { campaigns: bool, hubspot_team_activity: bool } for the signed-in user, or
// null if the check isn't available yet (migration 0017 not run).
export async function loadTabAccess() {
  const keys = Object.values(GATED_TABS);
  const res = await Promise.all(keys.map((k) => supabase.rpc("can_view_tab", { p_tab: k })));
  if (res.some((r) => r.error)) return null;
  return Object.fromEntries(keys.map((k, i) => [k, res[i].data === true]));
}

// May `me` see the tab with sidebar key `navKey`?
export function canSeeTab(navKey, me, db) {
  if (!me) return false;
  if (me.role === "admin") return true;
  if (db.tabAccess) return !!db.tabAccess[GATED_TABS[navKey]];
  // Until migration 0017 is run: the previous fixed rules.
  return navKey === "campaigns" ? canSeeCampaigns(me, db.projects) : me.role === "manager";
}

// { campaigns: bool, hubspot: bool } keyed by sidebar key.
export function tabAccessMap(me, db) {
  return Object.fromEntries(Object.keys(GATED_TABS).map((k) => [k, canSeeTab(k, me, db)]));
}

// Admin panel: current grants for one tab.
export async function loadTabGrants(tab) {
  const { data, error } = await supabase.from("tab_access").select("role,user_id").eq("tab_key", tab);
  if (error) throw error;
  return {
    roles: data.filter((r) => r.role).map((r) => r.role),
    users: data.filter((r) => r.user_id).map((r) => r.user_id),
  };
}

export async function saveTabGrants(tab, roles, users) {
  const { error } = await supabase.rpc("set_tab_access", { p_tab: tab, p_roles: roles, p_users: users });
  if (error) throw error;
}
