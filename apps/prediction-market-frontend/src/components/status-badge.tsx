import { Badge } from "@/components/ui/badge";
import type { EventStatus } from "@/lib/market-utils";

export function StatusBadge({ status }: { status: EventStatus }) {
  switch (status) {
    case "open":
      return (
        <Badge variant="accent" className="text-[0.6rem]">
          <span className="mr-0.5 inline-block size-1.5 animate-pulse rounded-full bg-current" />
          Live
        </Badge>
      );
    case "closed":
      return (
        <Badge variant="muted" className="text-[0.6rem]">
          Closed
        </Badge>
      );
    case "settling":
      return (
        <Badge
          variant="outline"
          className="border-yellow-500/30 bg-yellow-500/10 text-[0.6rem] text-yellow-400"
        >
          Settling
        </Badge>
      );
    case "settled":
      return (
        <Badge variant="muted" className="text-[0.6rem]">
          Settled
        </Badge>
      );
    case "manual":
      return (
        <Badge
          variant="outline"
          className="border-orange-500/30 bg-orange-500/10 text-[0.6rem] text-orange-300"
        >
          Manual
        </Badge>
      );
  }
}
