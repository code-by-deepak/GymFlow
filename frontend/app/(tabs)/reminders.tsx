import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { EmptyState, Pill, toast } from "@/src/components/ui";
import { colors, reminderStatusColor } from "@/src/theme/colors";
import { fmtDate } from "@/src/utils/format";

type Reminder = {
  id: string; member_name: string; phone: string; reminder_type: string;
  message: string; status: string; sent_at: string;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "delivered", label: "Delivered" },
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
] as const;

export default function RemindersScreen() {
  const [items, setItems] = useState<Reminder[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async (f = filter) => {
    try {
      const res = await api.get<Reminder[]>(`/reminders?status_filter=${f}`);
      setItems(res);
    } finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { load(filter); }, [filter, load]);
  useFocusEffect(useCallback(() => { load(filter); }, [filter, load]));

  const runScan = async () => {
    setRunning(true);
    try {
      const res = await api.post<{ sent: number; skipped?: string }>("/reminders/run");
      toast(res.skipped ? res.skipped : `Sent ${res.sent} reminder${res.sent === 1 ? "" : "s"}`, "success");
      load(filter);
    } catch (e: any) { toast(e?.message || "Failed", "error"); } finally { setRunning(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Reminders</Text>
        <TouchableOpacity testID="run-reminders-button" disabled={running} onPress={runScan} style={[styles.runBtn, running && { opacity: 0.5 }]}>
          {running ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="paper-plane" size={16} color="#fff" />}
          <Text style={styles.runBtnTxt}>{running ? "Sending…" : "Run now"}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterScroll}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <TouchableOpacity key={f.key} testID={`reminder-filter-${f.key}`} onPress={() => setFilter(f.key)}
              style={[styles.chip, active && styles.chipActive]} activeOpacity={0.85}>
              <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={r => r.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(filter); }} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            const c = reminderStatusColor(item.status);
            return (
              <View style={styles.row} testID={`reminder-row-${item.id}`}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.member_name}</Text>
                  <Pill label={item.status} bg={c.bg} fg={c.fg} />
                </View>
                <Text style={styles.rowPhone}>{item.phone} · {item.reminder_type}</Text>
                <Text style={styles.rowMsg} numberOfLines={2}>{item.message}</Text>
                <Text style={styles.rowDate}>{fmtDate(item.sent_at)}</Text>
              </View>
            );
          }}
          ListEmptyComponent={<EmptyState title="No reminders yet" subtitle="Tap 'Run now' to send due reminders." />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  h1: { fontSize: 26, fontWeight: "900", color: colors.text, letterSpacing: -0.6 },
  runBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 19, backgroundColor: colors.primary },
  runBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 13 },
  filterScroll: { maxHeight: 56 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 8, alignItems: "center" },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { fontSize: 13, fontWeight: "600", color: colors.text },
  chipTxtActive: { color: "#fff" },
  list: { paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 },
  row: { padding: 14, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  rowHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowName: { fontWeight: "800", color: colors.text, fontSize: 14, flex: 1, marginRight: 8 },
  rowPhone: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  rowMsg: { color: colors.text, fontSize: 13, marginTop: 8, lineHeight: 18 },
  rowDate: { color: colors.textSubtle, fontSize: 11, marginTop: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
