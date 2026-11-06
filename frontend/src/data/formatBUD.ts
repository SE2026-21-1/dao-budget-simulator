export function formatBUD(rawAmount: string): string {
  const amount = BigInt(rawAmount);
  const base = 10n ** 18n;
  const whole = amount / base;
  const fraction = (amount % base).toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("vi-VN")}${fraction ? `,${fraction}` : ""} BUD`;
}

// Compact amounts are explicitly approximate when hidden fractional digits are non-zero.
export function formatCompactBUD(rawAmount: string): string {
  const amount = BigInt(rawAmount);
  const base = 10n ** 18n;
  const whole = amount / base;
  const fraction = (amount % base).toString().padStart(18, "0");
  const visible = fraction.slice(0, 3).replace(/0+$/, "");
  const hasHiddenValue = /[1-9]/.test(fraction.slice(3));
  return `${hasHiddenValue ? "≈ " : ""}${whole.toLocaleString("vi-VN")}${visible ? `,${visible}` : ""} BUD`;
}
