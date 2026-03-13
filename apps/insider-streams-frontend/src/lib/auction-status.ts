import { isPast } from "date-fns";

/** Derive display status: if subgraph says "Open" but endTime is past, show "Ended". */
export function getEffectiveStatus(status: string, endTime?: string): string {
  if (status === "Open" && endTime) {
    const end = new Date(endTime);
    if (isPast(end)) return "Ended";
  }
  return status;
}
