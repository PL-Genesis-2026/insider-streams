import { Badge } from "@/components/ui/badge";
import type { FundingStatus } from "@/lib/funding/types";

const fundingBadgeVariantByStatus: Record<
  FundingStatus,
  "accent" | "destructive" | "outline" | "secondary"
> = {
  wallet_required: "outline",
  wrong_network: "destructive",
  funding_unavailable: "destructive",
  not_funded_yet: "outline",
  reconciling_transfer: "accent",
  funded: "accent",
  withdrawal_available: "secondary",
};

const fundingLabelByStatus: Record<FundingStatus, string> = {
  wallet_required: "Wallet required",
  wrong_network: "Wrong network",
  funding_unavailable: "Wallet unavailable",
  not_funded_yet: "Not funded yet",
  reconciling_transfer: "Updating",
  funded: "Wallet funded",
  withdrawal_available: "Balance available",
};

export function FundingStatusBadge({ status }: { status: FundingStatus }) {
  return (
    <Badge variant={fundingBadgeVariantByStatus[status]}>
      {fundingLabelByStatus[status]}
    </Badge>
  );
}
