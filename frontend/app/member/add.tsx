import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { BottomSheet, Button, Input, toast } from "@/src/components/ui";
import { colors } from "@/src/theme/colors";
import { todayISO, addDays, fmtDate, money } from "@/src/utils/format";

type Plan = { id: string; name: string; duration_days: number; price: number };

export default function AddMember() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planSheet, setPlanSheet] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    full_name: "", mobile: "", gender: "", age: "", address: "", emergency_contact: "",
    start_date: todayISO(), amount_paid: "", notes: "",
  });

  useEffect(() => {
    api.get<Plan[]>("/plans").then(p => {
      setPlans(p);
      if (p.length) { setSelectedPlan(p[0]); setForm(f => ({ ...f, amount_paid: String(p[0].price) })); }
    });
  }, []);

  const expiry = selectedPlan ? addDays(form.start_date, selectedPlan.duration_days) : null;

  const save = async () => {
    if (!form.full_name || !form.mobile || !selectedPlan || !form.start_date || !form.amount_paid) {
      toast("Name, mobile, plan, start date and amount required", "error"); return;
    }
    setSaving(true);
    try {
      await api.post("/members", {
        full_name: form.full_name,
        mobile: form.mobile,
        gender: form.gender || null,
        age: form.age ? Number(form.age) : null,
        address: form.address || null,
        emergency_contact: form.emergency_contact || null,
        plan_id: selectedPlan.id,
        start_date: form.start_date,
        amount_paid: Number(form.amount_paid),
        notes: form.notes || null,
      });
      toast("Member added", "success");
      router.back();
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-button">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add member</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Input testID="add-member-name" label="Full name" placeholder="John Doe" value={form.full_name} onChangeText={v => setForm({ ...form, full_name: v })} />
          <Input testID="add-member-mobile" label="Mobile" placeholder="+91 9876543210" keyboardType="phone-pad" value={form.mobile} onChangeText={v => setForm({ ...form, mobile: v })} />

          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Input testID="add-member-gender" label="Gender" placeholder="M / F / Other" value={form.gender} onChangeText={v => setForm({ ...form, gender: v })} />
            </View>
            <View style={{ flex: 1 }}>
              <Input testID="add-member-age" label="Age" placeholder="28" keyboardType="number-pad" value={form.age} onChangeText={v => setForm({ ...form, age: v.replace(/\D/g, "") })} />
            </View>
          </View>

          <Input testID="add-member-address" label="Address" placeholder="123 Main St" value={form.address} onChangeText={v => setForm({ ...form, address: v })} />
          <Input testID="add-member-emergency" label="Emergency contact" placeholder="Optional" keyboardType="phone-pad" value={form.emergency_contact} onChangeText={v => setForm({ ...form, emergency_contact: v })} />

          <Text style={styles.label}>Plan</Text>
          <TouchableOpacity testID="select-plan-button" onPress={() => setPlanSheet(true)} style={styles.select}>
            <Text style={styles.selectTxt}>{selectedPlan ? `${selectedPlan.name} · ${selectedPlan.duration_days}d · ₹${money(selectedPlan.price)}` : "Choose a plan"}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Input testID="add-member-start" label="Start date (YYYY-MM-DD)" value={form.start_date} onChangeText={v => setForm({ ...form, start_date: v })} />
            </View>
            <View style={{ flex: 1 }}>
              <Input testID="add-member-amount" label="Amount paid" keyboardType="decimal-pad" value={form.amount_paid} onChangeText={v => setForm({ ...form, amount_paid: v.replace(/[^0-9.]/g, "") })} />
            </View>
          </View>

          {expiry ? (
            <View style={styles.expiryBox}>
              <Ionicons name="calendar-outline" size={16} color={colors.accent} />
              <Text style={styles.expiryTxt}>Membership will expire on <Text style={{ fontWeight: "800" }}>{fmtDate(expiry)}</Text></Text>
            </View>
          ) : null}

          <Input testID="add-member-notes" label="Notes" placeholder="Optional" multiline numberOfLines={3} value={form.notes} onChangeText={v => setForm({ ...form, notes: v })} style={{ height: 90, paddingTop: 12, textAlignVertical: "top" }} />

          <Button testID="add-member-save" title="Save member" onPress={save} loading={saving} />
        </ScrollView>

        <BottomSheet visible={planSheet} onClose={() => setPlanSheet(false)} title="Select plan">
          {plans.map(p => (
            <TouchableOpacity key={p.id} testID={`plan-option-${p.id}`} onPress={() => { setSelectedPlan(p); setForm(f => ({ ...f, amount_paid: String(p.price) })); setPlanSheet(false); }} style={styles.planRow}>
              <View>
                <Text style={styles.planRowName}>{p.name}</Text>
                <Text style={styles.planRowSub}>{p.duration_days} days · ₹{money(p.price)}</Text>
              </View>
              {selectedPlan?.id === p.id && <Ionicons name="checkmark" size={20} color={colors.success} />}
            </TouchableOpacity>
          ))}
        </BottomSheet>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "#fff" },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4F6" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  scroll: { padding: 20, paddingBottom: 32 },
  label: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginBottom: 6, letterSpacing: 0.4, textTransform: "uppercase" },
  select: { height: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectTxt: { color: colors.text, fontWeight: "600" },
  expiryBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: "#EFF6FF", borderRadius: 12, marginBottom: 16, marginTop: -4 },
  expiryTxt: { color: colors.accent, fontSize: 13, flex: 1 },
  planRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  planRowName: { fontWeight: "700", color: colors.text, fontSize: 15 },
  planRowSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
});
