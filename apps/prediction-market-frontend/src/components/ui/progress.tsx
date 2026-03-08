import { cn } from "@/lib/utils";

type ProgressProps = {
  value: number;
  className?: string;
};

export function Progress({ value, className }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "relative h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

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
