import { ExternalLink } from "lucide-react";
import { SEPOLIA_EXPLORER_URL } from "@/lib/market-utils";
import { formatAddress } from "@/lib/wallet/format-address";

type EtherscanLinkProps = {
  type: "tx" | "address" | "token";
  value: string;
  className?: string;
};

function pathForType(type: EtherscanLinkProps["type"]): string {
  switch (type) {
    case "tx":
      return "tx";
    case "address":
      return "address";
    case "token":
      return "token";
  }
}

export function EtherscanLink({ type, value, className }: EtherscanLinkProps) {
  const path = pathForType(type);
  return (
    <a
      href={`${SEPOLIA_EXPLORER_URL}/${path}/${value}`}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        "inline-flex items-center gap-1 font-mono text-xs text-accent underline-offset-4 hover:underline"
      }
    >
      {formatAddress(value, 10, 6)}
      <ExternalLink className="size-2.5" />
    </a>
  );
}
