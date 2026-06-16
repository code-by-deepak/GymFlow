// Shared UI primitives — Button, Input, Card, Pill, Toast, BottomSheet.
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing } from "@/src/theme/colors";

// ── Button ─────────────────────────────────────────────
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export function Button({
  title, onPress, variant = "primary", loading, disabled, testID, style, leftIcon,
}: {
  title: string; onPress?: () => void; variant?: ButtonVariant;
  loading?: boolean; disabled?: boolean; testID?: string; style?: ViewStyle; leftIcon?: React.ReactNode;
}) {
  const isDisabled = disabled || loading;
  const bg = variant === "primary" ? colors.primary
    : variant === "danger" ? "#FEF2F2"
    : variant === "ghost" ? "transparent"
    : "#F3F4F6";
  const fg = variant === "primary" ? colors.primaryFg
    : variant === "danger" ? colors.danger
    : colors.text;
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.85}
      style={[styles.btn, { backgroundColor: bg, opacity: isDisabled ? 0.5 : 1 }, style]}
    >
      {leftIcon}
      <Text style={[styles.btnTxt, { color: fg, marginLeft: leftIcon ? 8 : 0 }]}>
        {loading ? "Please wait…" : title}
      </Text>
    </TouchableOpacity>
  );
}

// ── Input ──────────────────────────────────────────────
export function Input({
  label, error, testID, style, ...rest
}: TextInputProps & { label?: string; error?: string; testID?: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TextInput
        testID={testID}
        placeholderTextColor={colors.textSubtle}
        style={[styles.input, error ? { borderColor: colors.danger } : null, style]}
        {...rest}
      />
      {error ? <Text style={styles.inputError}>{error}</Text> : null}
    </View>
  );
}

// ── Card ───────────────────────────────────────────────
export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  return <View testID={testID} style={[styles.card, style]}>{children}</View>;
}

// ── Pill ───────────────────────────────────────────────
export function Pill({ label, bg, fg, border, testID }: { label: string; bg: string; fg: string; border?: string; testID?: string }) {
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: bg, borderColor: border ?? "transparent" }]}>
      <Text style={[styles.pillTxt, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ── Toast (global) ─────────────────────────────────────
type ToastMsg = { id: number; text: string; type: "success" | "error" | "info" };
const toastListeners = new Set<(t: ToastMsg) => void>();
export function toast(text: string, type: "success" | "error" | "info" = "info") {
  toastListeners.forEach(l => l({ id: Date.now() + Math.random(), text, type }));
}
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = React.useState<ToastMsg[]>([]);
  useEffect(() => {
    const cb = (t: ToastMsg) => {
      setItems(prev => [...prev, t]);
      setTimeout(() => setItems(prev => prev.filter(p => p.id !== t.id)), 3000);
    };
    toastListeners.add(cb);
    return () => { toastListeners.delete(cb); };
  }, []);
  return (
    <View pointerEvents="box-none" style={[styles.toastHost, { top: insets.top + 12 }]}>
      {items.map(t => (
        <View key={t.id} style={[styles.toast, {
          backgroundColor: t.type === "success" ? "#064E3B" : t.type === "error" ? "#7F1D1D" : "#111827",
        }]}>
          <Text style={styles.toastTxt}>{t.text}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Bottom Sheet ───────────────────────────────────────
export function BottomSheet({
  visible, onClose, children, title, testID,
}: { visible: boolean; onClose: () => void; children: React.ReactNode; title?: string; testID?: string }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const translate = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    Animated.timing(translate, {
      toValue: visible ? 0 : height,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, height, translate]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} testID={testID}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} testID="sheet-backdrop" />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
          <Animated.View style={[styles.sheet, { transform: [{ translateY: translate }], paddingBottom: insets.bottom + 16, maxHeight: height * 0.9 }]}>
            <View style={styles.sheetHandle} />
            {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Section Title ─────────────────────────────────────
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

// ── EmptyState ────────────────────────────────────────
export function EmptyState({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
      {action ? <View style={{ marginTop: 16 }}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  btnTxt: { fontSize: 15, fontWeight: "700", letterSpacing: 0.1 },
  inputLabel: {
    fontSize: 12, fontWeight: "600", color: colors.textMuted,
    marginBottom: 6, letterSpacing: 0.4, textTransform: "uppercase",
  },
  input: {
    height: 52, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, paddingHorizontal: spacing.lg, fontSize: 15, color: colors.text,
  },
  inputError: { color: colors.danger, fontSize: 12, marginTop: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  pill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, borderWidth: 1,
    alignSelf: "flex-start",
  },
  pillTxt: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  toastHost: {
    position: "absolute", left: 16, right: 16, alignItems: "center", zIndex: 9999,
  },
  toast: {
    marginTop: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    minWidth: 220, maxWidth: "100%",
  },
  toastTxt: { color: "#fff", fontSize: 14, fontWeight: "600", textAlign: "center" },
  sheetBackdrop: {
    flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 8, paddingHorizontal: 20,
  },
  sheetHandle: {
    alignSelf: "center", width: 44, height: 4, borderRadius: 4, backgroundColor: "#E5E7EB", marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: 12 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  empty: {
    paddingVertical: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 24,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 4, textAlign: "center" },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: "center" },
});
