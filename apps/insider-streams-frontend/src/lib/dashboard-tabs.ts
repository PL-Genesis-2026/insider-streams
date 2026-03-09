export const DASHBOARD_TABS = ["wallet", "positions", "signals"] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export const DEFAULT_DASHBOARD_TAB: DashboardTab = "wallet";

export function isDashboardTab(value: string): value is DashboardTab {
  return DASHBOARD_TABS.includes(value as DashboardTab);
}

export function getDashboardTabHref(tab: DashboardTab): string {
  return `/dashboard/${tab}`;
}
