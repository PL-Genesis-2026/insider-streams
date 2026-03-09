import { notFound } from "next/navigation";
import { BuyerDashboard } from "@/components/buyer-dashboard";
import { isDashboardTab } from "@/lib/dashboard-tabs";

type DashboardTabPageProps = {
  params: Promise<{
    tab: string;
  }>;
};

export default async function DashboardTabPage({
  params,
}: DashboardTabPageProps) {
  const { tab } = await params;

  if (!isDashboardTab(tab)) {
    notFound();
  }

  return (
    <main className="min-h-screen text-foreground">
      <BuyerDashboard activeTab={tab} />
    </main>
  );
}
