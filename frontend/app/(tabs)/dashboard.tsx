import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { BarChart, LineChart } from "react-native-gifted-charts";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/store/auth";
import { colors } from "@/src/theme/colors";
import { money } from "@/src/utils/format";

type Dashboard = {
  metrics: {
    total_members: number; active_members: number; expiring_soon: number;
    expired_members: number; renewals_this_month: number; monthly_revenue: number;
  };
  growth: { month: string; value: number }[];
  revenue_trend: { month: string; value: number }[];
  expiry_trend: { label: string; value: number }[];
  revenue_by_plan: { plan: string; value: number }[];
  reminder_metrics: { sent: number; delivered: number; failed: number };
};

export default function DashboardScreen() {
  const { user, gym } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get<Dashboard>("/dashboard");
      setData(d);
    } catch {/* */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }
  const m = data?.metrics;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greet}>Hi, {user?.owner_name?.split(" ")[0] || "there"}</Text>
            <Text style={styles.gymName}>{gym?.name}</Text>
          </View>
          <TouchableOpacity testID="header-expiring-button" style={styles.headerIcon} onPress={() => router.push("/expiring")}>
            <Ionicons name="alert-circle-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <QuickBtn icon="person-add-outline" label="Add member" testID="quick-add-member" onPress={() => router.push("/member/add")} />
          <QuickBtn icon="refresh-outline" label="View expiring" testID="quick-view-expiring" onPress={() => router.push("/expiring")} />
          <QuickBtn icon="paper-plane-outline" label="Run reminders" testID="quick-run-reminders"
            onPress={async () => { await api.post("/reminders/run"); router.push("/(tabs)/reminders"); }} />
          <QuickBtn icon="pricetags-outline" label="New plan" testID="quick-new-plan" onPress={() => router.push("/(tabs)/plans")} />
        </View>

        {/* Metric cards */}
        <View style={styles.metricGrid}>
          <MetricCard testID="metric-total" label="TOTAL MEMBERS" value={String(m?.total_members ?? 0)} accent={colors.text} />
          <MetricCard testID="metric-active" label="ACTIVE" value={String(m?.active_members ?? 0)} accent={colors.success} />
          <MetricCard testID="metric-expiring" label="EXPIRING SOON" value={String(m?.expiring_soon ?? 0)} accent={colors.warning} />
          <MetricCard testID="metric-expired" label="EXPIRED" value={String(m?.expired_members ?? 0)} accent={colors.danger} />
          <MetricCard testID="metric-renewals" label="RENEWALS / MONTH" value={String(m?.renewals_this_month ?? 0)} accent={colors.accent} />
          <MetricCard testID="metric-revenue" label="REVENUE / MONTH" value={`₹${money(m?.monthly_revenue)}`} accent={colors.text} />
        </View>

        {/* Charts */}
        <Text style={styles.sectionTitle}>Membership growth</Text>
        <View style={styles.chartCard}>
          {data && (
            <BarChart
              data={data.growth.map(g => ({ value: g.value, label: g.month, frontColor: colors.primary }))}
              barWidth={22}
              spacing={18}
              hideRules
              xAxisColor={colors.border}
              yAxisColor={colors.border}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              noOfSections={4}
              maxValue={Math.max(4, ...data.growth.map(g => g.value)) + 1}
            />
          )}
        </View>

        <Text style={styles.sectionTitle}>Revenue trend</Text>
        <View style={styles.chartCard}>
          {data && (
            <LineChart
              data={data.revenue_trend.map(g => ({ value: g.value, label: g.month }))}
              color={colors.accent}
              thickness={3}
              dataPointsColor={colors.accent}
              areaChart
              startFillColor={colors.accent}
              endFillColor={colors.accent}
              startOpacity={0.18}
              endOpacity={0.02}
              hideRules
              xAxisColor={colors.border}
              yAxisColor={colors.border}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              noOfSections={4}
              maxValue={Math.max(1000, ...data.revenue_trend.map(g => g.value)) * 1.1}
              initialSpacing={10}
              spacing={50}
            />
          )}
        </View>

        <Text style={styles.sectionTitle}>Expiry trend (next 4 weeks)</Text>
        <View style={styles.chartCard}>
          {data && (
            <BarChart
              data={data.expiry_trend.map(g => ({ value: g.value, label: g.label, frontColor: colors.warning }))}
              barWidth={32}
              spacing={28}
              hideRules
              xAxisColor={colors.border}
              yAxisColor={colors.border}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 11 }}
              noOfSections={4}
              maxValue={Math.max(4, ...data.expiry_trend.map(g => g.value)) + 1}
            />
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickBtn({ icon, label, onPress, testID }: { icon: any; label: string; onPress?: () => void; testID?: string }) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress} style={styles.quickBtn} activeOpacity={0.85}>
      <View style={styles.quickIcon}><Ionicons name={icon} size={20} color={colors.text} /></View>
      <Text style={styles.quickTxt} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

function MetricCard({ label, value, accent, testID }: { label: string; value: string; accent: string; testID?: string }) {
  return (
    <View testID={testID} style={styles.metricCard}>
      <View style={[styles.metricDot, { backgroundColor: accent }]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 16 },
  greet: { fontSize: 14, color: colors.textMuted, marginBottom: 2 },
  gymName: { fontSize: 22, fontWeight: "900", color: colors.text, letterSpacing: -0.6 },
  headerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  quickRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  quickBtn: { flex: 1, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12, alignItems: "center", justifyContent: "center", minHeight: 80 },
  quickIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  quickTxt: { fontSize: 11, color: colors.text, fontWeight: "600", textAlign: "center" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  metricCard: { flexBasis: "48%", flexGrow: 1, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
  metricDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 10 },
  metricLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted, letterSpacing: 1, marginBottom: 6 },
  metricValue: { fontSize: 24, fontWeight: "900", color: colors.text, letterSpacing: -0.6 },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: colors.text, marginTop: 12, marginBottom: 10, letterSpacing: -0.2 },
  chartCard: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, overflow: "hidden" },
});
