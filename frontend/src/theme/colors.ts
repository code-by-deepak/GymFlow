export const colors = {
  bg: "#F9FAFB",
  surface: "#FFFFFF",
  primary: "#0A0A0A",
  primaryFg: "#FFFFFF",
  accent: "#2563EB",
  accentHover: "#1D4ED8",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  text: "#111827",
  textMuted: "#6B7280",
  textSubtle: "#9CA3AF",
};

export const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const statusColor = (s: string) => {
  if (s === "active") return { bg: "#ECFDF5", fg: "#047857", border: "#A7F3D0" };
  if (s === "expiring_soon") return { bg: "#FFFBEB", fg: "#B45309", border: "#FCD34D" };
  if (s === "expired") return { bg: "#FEF2F2", fg: "#B91C1C", border: "#FECACA" };
  return { bg: "#F3F4F6", fg: "#374151", border: "#E5E7EB" };
};

export const statusLabel = (s: string) =>
  s === "active" ? "Active" : s === "expiring_soon" ? "Expiring soon" : s === "expired" ? "Expired" : s;

export const reminderStatusColor = (s: string) => {
  if (s === "delivered") return { bg: "#ECFDF5", fg: "#047857" };
  if (s === "sent") return { bg: "#FFFBEB", fg: "#B45309" };
  if (s === "failed") return { bg: "#FEF2F2", fg: "#B91C1C" };
  return { bg: "#F3F4F6", fg: "#374151" };
};
