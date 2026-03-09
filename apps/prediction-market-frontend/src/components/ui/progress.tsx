import { cn } from "@/lib/utils";

type DualProgressProps = {
  yesPercent: number;
  className?: string;
};

export function DualProgress({ yesPercent, className }: DualProgressProps) {
  const yes = Math.max(0, Math.min(100, yesPercent));
  return (
    <div
      className={cn(
        "relative flex h-2 w-full overflow-hidden rounded-full",
        className,
      )}
    >
      <div
        className="h-full bg-emerald-500/80 transition-all duration-500 ease-out"
        style={{ width: `${yes}%` }}
      />
      <div
        className="h-full flex-1 bg-rose-500/60"
      />
    </div>
  );
}
