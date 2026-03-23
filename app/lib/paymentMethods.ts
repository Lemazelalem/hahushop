// lib/paymentMethods.ts

export type PaymentMethodId =
  | "bank_transfer_cbe"
  | "ceb_link"
  | "telebirr"
  | "cbe_birr"
  | "pay_on_delivery"
  | "cash_on_delivery"
  | "card"
  | "apple_pay"
  | "google_pay"
  | "paypal"
  | string;

export function getPaymentMethodLabel(
  method: string | null | undefined
): string {
  if (!method) return "Not specified";
  const m = method.toLowerCase().trim();

  switch (m) {
    case "bank_transfer_cbe":
    case "bank_transfer":
    case "cbe_bank_transfer":
      return "CBE Bank Transfer";
    case "ceb_link":
      return "CEB Credit Link";
    case "telebirr":
      return "telebirr";
    case "cbe_birr":
      return "CBE Birr";
    case "pay_on_delivery":
    case "cash_on_delivery": // FIX: DB stores this variant
      return "Cash on delivery";
    case "card":
      return "Card (coming soon)";
    case "apple_pay":
      return "Apple Pay (coming soon)";
    case "google_pay":
      return "Google Pay (coming soon)";
    case "paypal":
      return "PayPal (coming soon)";
    default:
      return method;
  }
}

// FIX: accepts optional method so COD orders don't show "Unpaid"
export function getPaymentStatusLabel(
  status: string | null | undefined,
  method?: string | null
): string {
  const s = (status || "").toLowerCase().trim();
  const m = (method || "").toLowerCase().trim();

  const isCOD = m === "cash_on_delivery" || m === "pay_on_delivery";

  // For COD, "unpaid" just means "not yet collected" — relabel it
  if (isCOD && (s === "unpaid" || s === "" || s === "pending")) {
    return "Pay on delivery";
  }

  if (s === "unpaid" || s === "") return "Unpaid";
  if (s === "pending") return "Pending";
  if (s === "paid") return "Paid";
  if (s === "failed") return "Failed";

  return status ?? "Unpaid";
}

export function getPaymentStatusBadgeClass(
  status: string | null | undefined,
  method?: string | null // FIX: COD gets a neutral grey, not alarming amber
): string {
  const s = (status || "").toLowerCase().trim();
  const m = (method || "").toLowerCase().trim();
  const isCOD = m === "cash_on_delivery" || m === "pay_on_delivery";

  if (s === "paid") return "bg-emerald-100 text-emerald-800";
  if (s === "failed") return "bg-rose-100 text-rose-700";
  if (s === "pending" && !isCOD) return "bg-sky-100 text-sky-800";
  if (isCOD && s !== "paid") return "bg-slate-100 text-slate-600"; // neutral for COD
  if (s === "unpaid") return "bg-amber-100 text-amber-800";

  return "bg-slate-100 text-slate-700";
}

export function isBankTransferMethod(
  method: string | null | undefined
): boolean {
  if (!method) return false;
  const m = method.toLowerCase().trim();
  return (
    m === "bank_transfer_cbe" ||
    m === "bank_transfer" ||
    m === "cbe_bank_transfer"
  );
}