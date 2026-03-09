import { redirect } from "next/navigation";
import {
  DEFAULT_DASHBOARD_TAB,
  getDashboardTabHref,
} from "@/lib/dashboard-tabs";

export default function DashboardPage() {
  redirect(getDashboardTabHref(DEFAULT_DASHBOARD_TAB));
}
