import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { BottomSheet, Button, Card, Input, Pill, SectionTitle, toast } from "@/src/components/ui";
import { colors, statusColor, statusLabel } from "@/src/theme/colors";
import { addDays, fmtDate, money, todayISO } from "@/src/utils/format";

type Member = {
  id: string; full_name: string; mobile: string; gender?: string; age?: number;
  address?: string; emergency_contact?: string; plan_id: string; plan_name: string;
  joining_date?: string; start_date: string; expiry_date: string; amount_paid: number;
  notes?: string; status: string;
};
type Detail = {
  member: Member;
  payments: any[]; reminders: any[]; renewals: any[];
};
type Plan = { id: string; name: string; duration_days: number; price: number };

export default function MemberDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [renewSheet, setRenewSheet] = useState(false);
  const [editSheet, setEditSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const [renewForm, setRenewForm] = useState({ plan: null as Plan | null, amount: "", start: todayISO() });
  const [editForm, setEditForm] = useState<Partial<Member>>({});

  const load = useCallback(async () => {
    try {
      const d = await api.get<Detail>(`/members/${id}`);
      setData(d);
      setEditForm({
        full_name: d.member.full_name, mobile: d.member.mobile,
        gender: d.member.gender, age: d.member.age, address: d.member.address,
        emergency_contact: d.member.emergency_contact, notes: d.member.notes,
      });
    } catch (e: any) { toast(e?.message || "Failed", "error"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); api.get<Plan[]>("/plans").then(setPlans).catch(() => {}); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openRenew = () => {
    const today = todayISO();
    const expiryD = data?.member.expiry_date || today;
    const startD = expiryD >= today ? expiryD : today;
    const current = plans.find(p => p.id === data?.member.plan_id) || plans[0] || null;
    setRenewForm({ plan: current, amount: current ? String(current.price) : "", start: startD });
    setRenewSheet(true);
  };

  const submitRenew = async () => {
    if (!data || !renewForm.plan) return;
    setBusy(true);
    try {
      const res = await api.post<{ new_expiry: string }>(`/members/${data.member.id}/renew`, {
        plan_id: renewForm.plan.id,
        amount_paid: Number(renewForm.amount),
        start_date: renewForm.start,
      });
      toast(`Renewed until ${fmtDate(res.new_expiry)}`, "success");
      setRenewSheet(false);
      load();
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setBusy(false); }
  };

  const submitEdit = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await api.patch(`/members/${data.member.id}`, editForm);
      toast("Updated", "success");
      setEditSheet(false);
      load();
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setBusy(false); }
  };

  const submitDelete = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await api.del(`/members/${data.member.id}`);
      toast("Member deleted", "success");
      router.back();
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setBusy(false); }
  };

  const sendReminder = async (type: "upcoming" | "today" | "expired") => {
    if (!data) return;
    setBusy(true);
    try {
      await api.post("/reminders/send", { member_id: data.member.id, reminder_type: type });
      toast("Reminder sent", "success");
      load();
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setBusy(false); }
  };

  if (loading || !data) {
    return <SafeAreaView style={styles.safe} edges={["top"]}><View style={styles.center}><ActivityIndicator color={colors.primary} /></View></SafeAreaView>;
  }
  const m = data.member;
  const c = statusColor(m.status);
  const expiryPreview = renewForm.plan ? addDays(renewForm.start, renewForm.plan.duration_days) : null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-button">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{m.full_name}</Text>
        <TouchableOpacity onPress={() => setEditSheet(true)} style={styles.iconBtn} testID="edit-member-button">
          <Ionicons name="create-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile header */}
        <View style={styles.profileCard}>
          <View style={styles.bigAvatar}><Text style={styles.bigAvatarTxt}>{m.full_name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}</Text></View>
          <Text style={styles.bigName}>{m.full_name}</Text>
          <Text style={styles.bigMobile}>{m.mobile}</Text>
          <View style={{ marginTop: 10 }}>
            <Pill label={statusLabel(m.status)} bg={c.bg} fg={c.fg} border={c.border} />
          </View>
        </View>

        <View style={styles.actionRow}>
          <Button testID="renew-button" title="Renew" onPress={openRenew} style={{ flex: 1 }} />
          <Button testID="remind-upcoming-button" title="Send reminder" variant="secondary" onPress={() => sendReminder(m.status === "expired" ? "expired" : m.status === "expiring_soon" ? "upcoming" : "today")} style={{ flex: 1 }} />
        </View>

        <SectionTitle>Membership</SectionTitle>
        <Card>
          <KV k="Plan" v={m.plan_name} />
          <KV k="Start date" v={fmtDate(m.start_date)} />
          <KV k="Expiry date" v={fmtDate(m.expiry_date)} highlight={m.status !== "active"} />
          <KV k="Amount paid" v={`₹${money(m.amount_paid)}`} />
        </Card>

        <SectionTitle>Personal</SectionTitle>
        <Card>
          <KV k="Gender" v={m.gender || "—"} />
          <KV k="Age" v={m.age ? String(m.age) : "—"} />
          <KV k="Address" v={m.address || "—"} />
          <KV k="Emergency" v={m.emergency_contact || "—"} />
          <KV k="Joining" v={fmtDate(m.joining_date || m.start_date)} />
          {m.notes ? <KV k="Notes" v={m.notes} /> : null}
        </Card>

        <SectionTitle>Payments ({data.payments.length})</SectionTitle>
        <Card>
          {data.payments.length === 0 ? <Text style={styles.muted}>No payments yet</Text> : data.payments.map((p, idx) => (
            <View key={p.id} style={[styles.histRow, idx === data.payments.length - 1 && { borderBottomWidth: 0 }]}>
              <View>
                <Text style={styles.histPrimary}>₹{money(p.amount)}</Text>
                <Text style={styles.histSub}>{p.plan_name} · {p.kind}</Text>
              </View>
              <Text style={styles.histDate}>{fmtDate(p.paid_at)}</Text>
            </View>
          ))}
        </Card>

        <SectionTitle>Reminders ({data.reminders.length})</SectionTitle>
        <Card>
          {data.reminders.length === 0 ? <Text style={styles.muted}>No reminders sent</Text> : data.reminders.slice(0, 10).map((r, idx) => {
            const rc = r.status === "delivered" ? { bg: "#ECFDF5", fg: "#047857" } : r.status === "failed" ? { bg: "#FEF2F2", fg: "#B91C1C" } : { bg: "#FFFBEB", fg: "#B45309" };
            return (
              <View key={r.id} style={[styles.histRow, idx === Math.min(data.reminders.length, 10) - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.histPrimary}>{r.reminder_type}</Text>
                  <Text style={styles.histSub} numberOfLines={1}>{r.message}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Pill label={r.status} bg={rc.bg} fg={rc.fg} />
                  <Text style={styles.histDate}>{fmtDate(r.sent_at)}</Text>
                </View>
              </View>
            );
          })}
        </Card>

        <View style={{ marginTop: 12 }}>
          <Button testID="delete-member-button" title="Delete member" variant="danger" onPress={() => setConfirmDelete(true)} />
        </View>
      </ScrollView>

      {/* Renew sheet */}
      <BottomSheet visible={renewSheet} onClose={() => setRenewSheet(false)} title="Renew membership" testID="renew-sheet">
        <Text style={styles.label}>Choose plan</Text>
        <View style={styles.planChoices}>
          {plans.map(p => {
            const active = renewForm.plan?.id === p.id;
            return (
              <TouchableOpacity key={p.id} testID={`renew-plan-${p.id}`} onPress={() => setRenewForm(f => ({ ...f, plan: p, amount: String(p.price) }))}
                style={[styles.planChoice, active && styles.planChoiceActive]}>
                <Text style={[styles.planChoiceName, active && { color: "#fff" }]}>{p.name}</Text>
                <Text style={[styles.planChoiceSub, active && { color: "#fff" }]}>{p.duration_days}d · ₹{money(p.price)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Input testID="renew-start-date" label="Start date" value={renewForm.start} onChangeText={v => setRenewForm({ ...renewForm, start: v })} />
        <Input testID="renew-amount" label="Amount paid" keyboardType="decimal-pad" value={renewForm.amount} onChangeText={v => setRenewForm({ ...renewForm, amount: v.replace(/[^0-9.]/g, "") })} />
        {expiryPreview ? <View style={styles.expiryBox}><Ionicons name="calendar-outline" size={16} color={colors.accent} /><Text style={styles.expiryTxt}>New expiry: <Text style={{ fontWeight: "800" }}>{fmtDate(expiryPreview)}</Text></Text></View> : null}
        <Button testID="renew-confirm-button" title="Confirm renewal" onPress={submitRenew} loading={busy} />
      </BottomSheet>

      {/* Edit sheet */}
      <BottomSheet visible={editSheet} onClose={() => setEditSheet(false)} title="Edit member">
        <Input testID="edit-name" label="Full name" value={editForm.full_name as string} onChangeText={v => setEditForm({ ...editForm, full_name: v })} />
        <Input testID="edit-mobile" label="Mobile" value={editForm.mobile as string} keyboardType="phone-pad" onChangeText={v => setEditForm({ ...editForm, mobile: v })} />
        <Input testID="edit-address" label="Address" value={editForm.address as string} onChangeText={v => setEditForm({ ...editForm, address: v })} />
        <Input testID="edit-emergency" label="Emergency" value={editForm.emergency_contact as string} keyboardType="phone-pad" onChangeText={v => setEditForm({ ...editForm, emergency_contact: v })} />
        <Input testID="edit-notes" label="Notes" value={editForm.notes as string} multiline numberOfLines={3} onChangeText={v => setEditForm({ ...editForm, notes: v })} style={{ height: 90, paddingTop: 12, textAlignVertical: "top" }} />
        <Button testID="edit-save" title="Save changes" onPress={submitEdit} loading={busy} />
      </BottomSheet>

      <BottomSheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this member?">
        <Text style={styles.muted}>This will remove all payments, renewals, and reminder history for {m.full_name}.</Text>
        <View style={{ height: 16 }} />
        <Button testID="confirm-delete" title="Yes, delete" variant="danger" onPress={submitDelete} loading={busy} />
        <View style={{ height: 8 }} />
        <Button title="Cancel" variant="secondary" onPress={() => setConfirmDelete(false)} />
      </BottomSheet>
    </SafeAreaView>
  );
}

function KV({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.k}>{k}</Text>
      <Text style={[styles.v, highlight && { color: colors.danger }]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "#fff" },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4F6" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: colors.text, flex: 1, marginHorizontal: 8, textAlign: "center" },
  scroll: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  profileCard: { alignItems: "center", paddingVertical: 24, backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  bigAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  bigAvatarTxt: { color: "#fff", fontWeight: "900", fontSize: 24 },
  bigName: { fontSize: 22, fontWeight: "900", color: colors.text, letterSpacing: -0.5 },
  bigMobile: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 },
  k: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  v: { color: colors.text, fontSize: 14, fontWeight: "700", maxWidth: "60%", textAlign: "right" },
  histRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  histPrimary: { fontSize: 14, fontWeight: "700", color: colors.text },
  histSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  histDate: { fontSize: 11, color: colors.textSubtle },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginBottom: 8, letterSpacing: 0.4, textTransform: "uppercase" },
  planChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  planChoice: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  planChoiceActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  planChoiceName: { fontWeight: "700", color: colors.text, fontSize: 13 },
  planChoiceSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  expiryBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: "#EFF6FF", borderRadius: 12, marginBottom: 12 },
  expiryTxt: { color: colors.accent, fontSize: 13, flex: 1 },
});
