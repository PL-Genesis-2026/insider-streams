import { redirect } from "next/navigation";
import { getDashboardTabHref } from "@/lib/dashboard-tabs";

export default function FundingPage() {
  redirect(getDashboardTabHref("wallet"));
}
