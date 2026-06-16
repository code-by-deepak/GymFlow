import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Input, toast } from "@/src/components/ui";
import { api } from "@/src/api/client";
import { updateGymInState, useAuth } from "@/src/store/auth";
import { colors } from "@/src/theme/colors";
import { todayISO, addDays } from "@/src/utils/format";

const STEPS = ["Gym info", "First plan", "First member", "Reminders"];

export default function Onboarding() {
  const router = useRouter();
  const { gym } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Step 1
  const [gymForm, setGymForm] = useState({ name: gym?.name || "", address: "", phone: gym?.phone || "" });
  // Step 2
  const [plan, setPlan] = useState({ name: "Monthly", duration_days: "30", price: "1500" });
  const [planId, setPlanId] = useState<string | null>(null);
  // Step 3
  const [member, setMember] = useState({ full_name: "", mobile: "", amount_paid: "1500", start_date: todayISO() });
  // Step 4
  const [remindersEnabled, setRemindersEnabled] = useState(true);

  useEffect(() => {
    if (gym) setGymForm(g => ({ ...g, name: gym.name, phone: gym.phone }));
  }, [gym]);

  const next = () => setStep(s => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep(s => Math.max(0, s - 1));

  const submitStep1 = async () => {
    setLoading(true);
    try {
      const g = await api.patch<any>("/gym", { name: gymForm.name, address: gymForm.address, phone: gymForm.phone });
      updateGymInState(g);
      next();
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setLoading(false); }
  };

  const submitStep2 = async () => {
    setLoading(true);
    try {
      const p = await api.post<any>("/plans", { name: plan.name, duration_days: Number(plan.duration_days), price: Number(plan.price) });
      setPlanId(p.id);
      toast("Plan created", "success");
      next();
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setLoading(false); }
  };

  const submitStep3 = async () => {
    if (!planId) { toast("Create a plan first", "error"); return; }
    if (!member.full_name || !member.mobile) { toast("Name and mobile required", "error"); return; }
    setLoading(true);
    try {
      await api.post("/members", {
        full_name: member.full_name,
        mobile: member.mobile,
        plan_id: planId,
        start_date: member.start_date,
        amount_paid: Number(member.amount_paid),
      });
      toast("Member added", "success");
      next();
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setLoading(false); }
  };

  const finish = async () => {
    setLoading(true);
    try {
      await api.patch("/settings", { reminders_enabled: remindersEnabled });
      const g = await api.patch<any>("/gym", { onboarding_complete: true });
      updateGymInState(g);
      router.replace("/(tabs)/dashboard");
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setLoading(false); }
  };

  const skip = async () => {
    setLoading(true);
    try {
      const g = await api.patch<any>("/gym", { onboarding_complete: true });
      updateGymInState(g);
      router.replace("/(tabs)/dashboard");
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const expiryPreview = member.start_date && plan.duration_days
    ? addDays(member.start_date, Number(plan.duration_days)) : "";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          {step > 0 ? (
            <TouchableOpacity onPress={back} style={styles.iconBtn} testID="onboarding-back">
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </TouchableOpacity>
          ) : <View style={{ width: 36 }} />}
          <Text style={styles.stepLabel}>Step {step + 1} of {STEPS.length}</Text>
          <TouchableOpacity onPress={skip} testID="onboarding-skip"><Text style={styles.skip}>Skip</Text></TouchableOpacity>
        </View>

        <View style={styles.progress}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.bar, { backgroundColor: i <= step ? colors.primary : colors.border }]} />
          ))}
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{STEPS[step]}</Text>
          <Text style={styles.subtitle}>
            {step === 0 && "Tell us about your gym."}
            {step === 1 && "Create your first membership plan."}
            {step === 2 && "Add your first member to get started."}
            {step === 3 && "Enable automatic WhatsApp renewal reminders."}
          </Text>

          {step === 0 && (
            <>
              <Input testID="onb-gym-name" label="Gym name" value={gymForm.name} onChangeText={v => setGymForm({ ...gymForm, name: v })} />
              <Input testID="onb-gym-address" label="Address" placeholder="123 Fitness Lane" value={gymForm.address} onChangeText={v => setGymForm({ ...gymForm, address: v })} />
              <Input testID="onb-gym-phone" label="Phone" keyboardType="phone-pad" value={gymForm.phone} onChangeText={v => setGymForm({ ...gymForm, phone: v })} />
              <Button testID="onb-step1-next" title="Continue" onPress={submitStep1} loading={loading} />
            </>
          )}

          {step === 1 && (
            <>
              <Input testID="onb-plan-name" label="Plan name" value={plan.name} onChangeText={v => setPlan({ ...plan, name: v })} />
              <Input testID="onb-plan-duration" label="Duration (days)" keyboardType="number-pad" value={plan.duration_days} onChangeText={v => setPlan({ ...plan, duration_days: v.replace(/\D/g, "") })} />
              <Input testID="onb-plan-price" label="Price" keyboardType="decimal-pad" value={plan.price} onChangeText={v => setPlan({ ...plan, price: v.replace(/[^0-9.]/g, "") })} />
              <Button testID="onb-step2-next" title="Create plan" onPress={submitStep2} loading={loading} />
            </>
          )}

          {step === 2 && (
            <>
              <Input testID="onb-member-name" label="Full name" value={member.full_name} onChangeText={v => setMember({ ...member, full_name: v })} />
              <Input testID="onb-member-mobile" label="Mobile" keyboardType="phone-pad" value={member.mobile} onChangeText={v => setMember({ ...member, mobile: v })} />
              <Input testID="onb-member-amount" label="Amount paid" keyboardType="decimal-pad" value={member.amount_paid} onChangeText={v => setMember({ ...member, amount_paid: v.replace(/[^0-9.]/g, "") })} />
              <Input testID="onb-member-start" label="Start date (YYYY-MM-DD)" value={member.start_date} onChangeText={v => setMember({ ...member, start_date: v })} />
              {expiryPreview ? <Text style={styles.previewExpiry}>Expires on {expiryPreview}</Text> : null}
              <Button testID="onb-step3-next" title="Add member" onPress={submitStep3} loading={loading} />
            </>
          )}

          {step === 3 && (
            <View>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>WhatsApp renewal reminders</Text>
                  <Text style={styles.toggleSub}>Auto-send at 7d, 2d, 1d before, on expiry, and 3d after.</Text>
                </View>
                <Switch testID="onb-reminders-toggle" value={remindersEnabled} onValueChange={setRemindersEnabled} />
              </View>
              <Text style={styles.note}>
                WhatsApp sending is mocked for now. Add your WhatsApp Cloud API credentials in Settings to go live.
              </Text>
              <Button testID="onb-finish-button" title="Finish setup" onPress={finish} loading={loading} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  stepLabel: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  skip: { color: colors.textMuted, fontWeight: "600" },
  progress: { flexDirection: "row", gap: 6, paddingHorizontal: 16, marginBottom: 24 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  scroll: { paddingHorizontal: 24, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: "900", color: colors.text, letterSpacing: -0.8, marginBottom: 6 },
  subtitle: { fontSize: 15, color: colors.textMuted, marginBottom: 28, lineHeight: 22 },
  previewExpiry: { fontSize: 13, color: colors.accent, marginBottom: 12, fontWeight: "600" },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 16, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  toggleTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  toggleSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  note: { fontSize: 12, color: colors.textMuted, marginBottom: 20, lineHeight: 18 },
});
