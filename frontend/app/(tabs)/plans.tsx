import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { BottomSheet, Button, EmptyState, Input, toast } from "@/src/components/ui";
import { colors } from "@/src/theme/colors";
import { money } from "@/src/utils/format";

type Plan = { id: string; name: string; duration_days: number; price: number; active_members: number };

export default function PlansScreen() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [sheet, setSheet] = useState(false);
  const [form, setForm] = useState({ name: "", duration_days: "30", price: "1000" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setPlans(await api.get<Plan[]>("/plans")); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", duration_days: "30", price: "1000" });
    setSheet(true);
  };
  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({ name: p.name, duration_days: String(p.duration_days), price: String(p.price) });
    setSheet(true);
  };

  const save = async () => {
    if (!form.name || !form.duration_days || !form.price) { toast("All fields required", "error"); return; }
    setSaving(true);
    try {
      const body = { name: form.name, duration_days: Number(form.duration_days), price: Number(form.price) };
      if (editing) await api.patch(`/plans/${editing.id}`, body);
      else await api.post("/plans", body);
      toast(editing ? "Plan updated" : "Plan created", "success");
      setSheet(false);
      load();
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.del(`/plans/${editing.id}`);
      toast("Plan deleted", "success");
      setSheet(false);
      load();
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Plans</Text>
        <TouchableOpacity testID="add-plan-fab" onPress={openCreate} style={styles.addBtn}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={p => p.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <TouchableOpacity testID={`plan-row-${item.id}`} onPress={() => openEdit(item)} style={styles.card} activeOpacity={0.85}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planName}>{item.name}</Text>
                <Text style={styles.planSub}>{item.duration_days} days · ₹{money(item.price)}</Text>
                <Text style={styles.planMeta}>{item.active_members} member{item.active_members === 1 ? "" : "s"} on this plan</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<EmptyState title="No plans yet" subtitle="Create one to start enrolling members." />}
        />
      )}

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title={editing ? "Edit plan" : "New plan"} testID="plan-sheet">
        <Input testID="plan-name-input" label="Name" value={form.name} onChangeText={v => setForm({ ...form, name: v })} placeholder="Monthly" />
        <Input testID="plan-duration-input" label="Duration (days)" keyboardType="number-pad" value={form.duration_days} onChangeText={v => setForm({ ...form, duration_days: v.replace(/\D/g, "") })} />
        <Input testID="plan-price-input" label="Price" keyboardType="decimal-pad" value={form.price} onChangeText={v => setForm({ ...form, price: v.replace(/[^0-9.]/g, "") })} />
        <Button testID="plan-save-button" title={editing ? "Save changes" : "Create plan"} onPress={save} loading={saving} />
        {editing ? (
          <View style={{ marginTop: 8 }}>
            <Button testID="plan-delete-button" title="Delete plan" variant="danger" onPress={remove} loading={saving} />
          </View>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  h1: { fontSize: 26, fontWeight: "900", color: colors.text, letterSpacing: -0.6 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 },
  card: { flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  planName: { fontSize: 16, fontWeight: "800", color: colors.text },
  planSub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  planMeta: { fontSize: 11, color: colors.textSubtle, marginTop: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
