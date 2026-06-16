import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api/client";
import { Button, Card, Input, SectionTitle, toast } from "@/src/components/ui";
import { logout, updateGymInState, useAuth } from "@/src/store/auth";
import { colors } from "@/src/theme/colors";

type Settings = {
  reminders_enabled: boolean;
  reminder_days: number[];
  template_upcoming: string;
  template_today: string;
  template_expired: string;
  whatsapp_access_token?: string;
  whatsapp_phone_number_id?: string;
  whatsapp_business_account_id?: string;
};

export default function SettingsScreen() {
  const { user, gym } = useAuth();
  const [s, setS] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gymForm, setGymForm] = useState({ name: "", address: "", phone: "" });

  const load = useCallback(async () => {
    try {
      const data = await api.get<Settings>("/settings");
      setS(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (gym) setGymForm({ name: gym.name || "", address: gym.address || "", phone: gym.phone || "" });
  }, [gym]);

  const saveGym = async () => {
    setSaving(true);
    try {
      const g = await api.patch<any>("/gym", gymForm);
      updateGymInState(g);
      toast("Gym profile updated", "success");
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setSaving(false); }
  };

  const saveSettings = async (patch: Partial<Settings>) => {
    if (!s) return;
    setSaving(true);
    try {
      const updated = await api.patch<Settings>("/settings", patch);
      setS(updated);
      toast("Settings saved", "success");
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setSaving(false); }
  };

  if (loading || !s) {
    return <SafeAreaView style={styles.safe} edges={["top"]}><View style={styles.center}><ActivityIndicator color={colors.primary} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.h1}>Settings</Text>

          <View style={styles.profile}>
            <View style={styles.avatar}><Text style={styles.avatarTxt}>{(user?.owner_name || "").slice(0, 1).toUpperCase()}</Text></View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.profileName}>{user?.owner_name}</Text>
              <Text style={styles.profileSub}>{user?.email}</Text>
            </View>
          </View>

          <SectionTitle>Gym profile</SectionTitle>
          <Card>
            <Input testID="settings-gym-name" label="Gym name" value={gymForm.name} onChangeText={v => setGymForm({ ...gymForm, name: v })} />
            <Input testID="settings-gym-address" label="Address" value={gymForm.address} onChangeText={v => setGymForm({ ...gymForm, address: v })} />
            <Input testID="settings-gym-phone" label="Phone" value={gymForm.phone} keyboardType="phone-pad" onChangeText={v => setGymForm({ ...gymForm, phone: v })} />
            <Button testID="settings-save-gym" title="Save gym profile" onPress={saveGym} loading={saving} />
          </Card>

          <SectionTitle>Reminders</SectionTitle>
          <Card>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleTitle}>Auto-send reminders</Text>
                <Text style={styles.toggleSub}>WhatsApp messages at 7d, 2d, 1d before, expiry day, +3d after.</Text>
              </View>
              <Switch testID="settings-reminders-toggle" value={s.reminders_enabled} onValueChange={v => saveSettings({ reminders_enabled: v })} />
            </View>
            <Text style={styles.inlineNote}>Current schedule: {s.reminder_days.join(", ")} days from expiry</Text>
          </Card>

          <SectionTitle>WhatsApp Cloud API</SectionTitle>
          <Card>
            <Input testID="settings-wa-token" label="Access token" placeholder="EAAJ…" autoCapitalize="none" value={s.whatsapp_access_token || ""} onChangeText={v => setS({ ...s, whatsapp_access_token: v })} />
            <Input testID="settings-wa-phone-id" label="Phone Number ID" placeholder="123456…" autoCapitalize="none" value={s.whatsapp_phone_number_id || ""} onChangeText={v => setS({ ...s, whatsapp_phone_number_id: v })} />
            <Input testID="settings-wa-business-id" label="Business Account ID" placeholder="WABA ID" autoCapitalize="none" value={s.whatsapp_business_account_id || ""} onChangeText={v => setS({ ...s, whatsapp_business_account_id: v })} />
            <Button testID="settings-save-wa" title="Save WhatsApp config" onPress={() => saveSettings({
              whatsapp_access_token: s.whatsapp_access_token,
              whatsapp_phone_number_id: s.whatsapp_phone_number_id,
              whatsapp_business_account_id: s.whatsapp_business_account_id,
            })} loading={saving} />
            <Text style={styles.inlineNote}>Sender is currently MOCKED — saved credentials are not yet used to deliver real WhatsApp messages.</Text>
          </Card>

          <SectionTitle>Reminder templates</SectionTitle>
          <Card>
            <Input testID="settings-tpl-upcoming" label="Upcoming (7d/2d/1d)" value={s.template_upcoming} onChangeText={v => setS({ ...s, template_upcoming: v })} multiline numberOfLines={4} style={styles.textarea} />
            <Input testID="settings-tpl-today" label="Expires today" value={s.template_today} onChangeText={v => setS({ ...s, template_today: v })} multiline numberOfLines={3} style={styles.textarea} />
            <Input testID="settings-tpl-expired" label="Expired" value={s.template_expired} onChangeText={v => setS({ ...s, template_expired: v })} multiline numberOfLines={3} style={styles.textarea} />
            <Text style={styles.inlineNote}>Variables: {`{member_name}, {expiry_date}, {gym_name}`}</Text>
            <Button testID="settings-save-templates" title="Save templates" onPress={() => saveSettings({
              template_upcoming: s.template_upcoming, template_today: s.template_today, template_expired: s.template_expired,
            })} loading={saving} />
          </Card>

          <View style={{ marginTop: 12 }}>
            <Button testID="settings-logout" title="Log out" variant="danger" onPress={() => logout()} leftIcon={<Ionicons name="log-out-outline" size={18} color={colors.danger} />} />
          </View>
          <Text style={styles.footer}>GymFlow · v1.0</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  h1: { fontSize: 26, fontWeight: "900", color: colors.text, letterSpacing: -0.6, marginBottom: 16 },
  profile: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 20 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#fff", fontWeight: "900", fontSize: 18 },
  profileName: { fontWeight: "800", color: colors.text, fontSize: 16 },
  profileSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  toggleRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  toggleTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  toggleSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  inlineNote: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
  textarea: { height: 100, paddingTop: 12, textAlignVertical: "top" },
  footer: { color: colors.textSubtle, textAlign: "center", marginTop: 16, fontSize: 11 },
});
