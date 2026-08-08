export function formatUsdMicro(micro: bigint): string {
  const dollars = Number(micro) / 1_000_000;
  return `$${dollars.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
}

export function formatCount(value: bigint): string {
  return Number(value).toLocaleString("en-US");
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour12: false });
}
