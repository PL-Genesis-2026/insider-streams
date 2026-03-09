import { Badge } from "@/components/ui/badge";
import { OUTCOME } from "@/lib/market-utils";
import { outcomeLabel } from "@/lib/format";
import { CheckCircle2, XCircle } from "lucide-react";

export function OutcomeBadge({ outcome }: { outcome: number }) {
  const label = outcomeLabel(outcome);
  if (outcome === OUTCOME.Yes) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/15 text-[0.6rem] text-emerald-400"
      >
        <CheckCircle2 className="size-2.5" />
        {label}
      </Badge>
    );
  }
  if (outcome === OUTCOME.No) {
    return (
      <Badge
        variant="outline"
        className="border-rose-500/30 bg-rose-500/15 text-[0.6rem] text-rose-400"
      >
        <XCircle className="size-2.5" />
        {label}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-yellow-500/30 bg-yellow-500/15 text-[0.6rem] text-yellow-400"
    >
      {label}
    </Badge>
  );
}
