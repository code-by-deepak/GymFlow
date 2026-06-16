import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { EmptyState, Pill } from "@/src/components/ui";
import { colors, statusColor, statusLabel } from "@/src/theme/colors";
import { fmtDate, daysUntil } from "@/src/utils/format";

type Member = { id: string; full_name: string; mobile: string; plan_name: string; expiry_date: string; status: string };
type Resp = { today: Member[]; upcoming_7d: Member[]; expired: Member[] };

export default function Expiring() {
  const router = useRouter();
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api.get<Resp>("/expiring")); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="back-button">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Expiring</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          <Section title="Expiring today" badge={data?.today.length ?? 0} items={data?.today || []} router={router} emptyMsg="No memberships expiring today." testID="section-today" />
          <Section title="Next 7 days" badge={data?.upcoming_7d.length ?? 0} items={data?.upcoming_7d || []} router={router} emptyMsg="No upcoming expiries." testID="section-7d" />
          <Section title="Expired" badge={data?.expired.length ?? 0} items={data?.expired || []} router={router} emptyMsg="No expired members. 🎉" testID="section-expired" />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Section({ title, badge, items, router, emptyMsg, testID }: { title: string; badge: number; items: any[]; router: any; emptyMsg: string; testID?: string }) {
  return (
    <View style={{ marginBottom: 20 }} testID={testID}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.countPill}><Text style={styles.countTxt}>{badge}</Text></View>
      </View>
      {items.length === 0 ? (
        <View style={styles.emptySection}><Text style={styles.muted}>{emptyMsg}</Text></View>
      ) : (
        items.map((m, idx) => {
          const c = statusColor(m.status);
          const d = daysUntil(m.expiry_date);
          return (
            <TouchableOpacity key={m.id} testID={`expiring-row-${m.id}`} onPress={() => router.push(`/member/${m.id}`)}
              style={[styles.row, idx > 0 && { marginTop: 8 }]} activeOpacity={0.85}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{m.full_name}</Text>
                <Text style={styles.sub}>{m.plan_name} · {fmtDate(m.expiry_date)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Pill label={statusLabel(m.status)} bg={c.bg} fg={c.fg} border={c.border} />
                <Text style={styles.tinyDate}>{d === 0 ? "today" : d > 0 ? `${d}d left` : `${Math.abs(d)}d ago`}</Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "#fff" },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#F3F4F6" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  scroll: { padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  countPill: { paddingHorizontal: 8, height: 22, minWidth: 22, borderRadius: 11, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  countTxt: { fontWeight: "800", color: colors.text, fontSize: 11 },
  emptySection: { padding: 16, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  name: { fontWeight: "700", color: colors.text, fontSize: 14 },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  tinyDate: { color: colors.textMuted, fontSize: 11, marginTop: 6, fontWeight: "600" },
  muted: { color: colors.textMuted, fontSize: 13 },
});
