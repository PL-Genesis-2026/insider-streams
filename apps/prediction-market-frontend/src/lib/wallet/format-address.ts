export function formatAddress(address: string, visibleStart = 6, visibleEnd = 4) {
  if (address.length <= visibleStart + visibleEnd + 3) {
    return address;
  }

  return `${address.slice(0, visibleStart)}...${address.slice(-visibleEnd)}`;
}
