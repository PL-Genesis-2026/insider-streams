import { type SVGProps } from "react";

function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect
        x="16"
        y="2"
        width="19.8"
        height="19.8"
        rx="2"
        transform="rotate(45 16 2)"
        stroke="currentColor"
        strokeWidth="2.2"
        fill="none"
      />
      <path
        d="M8.5 20.5 Q16 15 23.5 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M8.5 14.5 Q16 19 23.5 22"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  showMark?: boolean;
  markSize?: number;
}

export function Logo({ className, showMark = true, markSize = 24 }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      {showMark ? (
        <LogoMark
          width={markSize}
          height={markSize}
          className="mt-[4px] text-accent shrink-0"
          aria-hidden="true"
        />
      ) : null}
      <span className="flex flex-col whitespace-nowrap leading-[0.84]">
        <span className="font-serif text-[1.36rem] font-medium italic tracking-[-0.04em] text-primary/90">
          Insider
        </span>
        <span className="mt-0.5 font-serif text-[0.86rem] font-bold uppercase tracking-[0.28em] text-foreground">
          Streams
        </span>
      </span>
    </span>
  );
}

export { LogoMark };
