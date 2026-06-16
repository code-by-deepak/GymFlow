import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { Pill, EmptyState } from "@/src/components/ui";
import { colors, statusColor, statusLabel } from "@/src/theme/colors";
import { fmtDate, daysUntil } from "@/src/utils/format";

type Member = {
  id: string; full_name: string; mobile: string; plan_name: string;
  plan_id: string; expiry_date: string; status: string;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "expiring_soon", label: "Expiring" },
  { key: "expired", label: "Expired" },
] as const;

export default function MembersScreen() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const load = useCallback(async () => {
    try {
      const list = await api.get<Member[]>(`/members?status_filter=all`);
      setMembers(list);
    } catch {/* */ } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    return members.filter(m => {
      if (filter !== "all" && m.status !== filter) return false;
      if (q.trim()) {
        const t = q.toLowerCase();
        if (!m.full_name.toLowerCase().includes(t) && !m.mobile.toLowerCase().includes(t)) return false;
      }
      return true;
    });
  }, [members, q, filter]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Members</Text>
        <TouchableOpacity testID="add-member-fab" onPress={() => router.push("/member/add")} style={styles.addBtn} activeOpacity={0.85}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          testID="members-search-input"
          placeholder="Search by name or phone"
          placeholderTextColor={colors.textSubtle}
          value={q}
          onChangeText={setQ}
          style={styles.searchInput}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterScroll}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              testID={`filter-chip-${f.key}`}
              onPress={() => setFilter(f.key)}
              style={[styles.chip, active && styles.chipActive]}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipTxt, active && styles.chipTxtActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item }) => <MemberRow item={item} onPress={() => router.push(`/member/${item.id}`)} />}
          ListEmptyComponent={
            <EmptyState
              title="No members"
              subtitle="Tap + to add your first member."
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </SafeAreaView>
  );
}

function MemberRow({ item, onPress }: { item: Member; onPress: () => void }) {
  const c = statusColor(item.status);
  const days = daysUntil(item.expiry_date);
  const initials = item.full_name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <TouchableOpacity onPress={onPress} testID={`member-row-${item.id}`} style={styles.row} activeOpacity={0.85}>
      <View style={styles.avatar}><Text style={styles.avatarTxt}>{initials || "?"}</Text></View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.rowName} numberOfLines={1}>{item.full_name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{item.plan_name} · {item.mobile}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Pill label={statusLabel(item.status)} bg={c.bg} fg={c.fg} border={c.border} />
        <Text style={styles.rowDate}>
          {item.status === "expired" ? `${Math.abs(days)}d ago` : days === 0 ? "Today" : `${days}d left`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  h1: { fontSize: 26, fontWeight: "900", color: colors.text, letterSpacing: -0.6 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, paddingHorizontal: 14, height: 44, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  searchInput: { flex: 1, marginLeft: 8, color: colors.text, fontSize: 14 },
  filterScroll: { maxHeight: 56 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, alignItems: "center" },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { fontSize: 13, fontWeight: "600", color: colors.text },
  chipTxtActive: { color: "#fff" },
  list: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  row: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontWeight: "800", color: colors.text, fontSize: 14 },
  rowName: { fontWeight: "700", color: colors.text, fontSize: 15 },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  rowDate: { fontSize: 11, color: colors.textMuted, marginTop: 6, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
