export function formatBUD(rawAmount: string): string {
  const amount = BigInt(rawAmount);
  const base = 10n ** 18n;
  const whole = amount / base;
  const fraction = (amount % base).toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("vi-VN")}${fraction ? `,${fraction}` : ""} BUD`;
}
