import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Input, toast } from "@/src/components/ui";
import { signup } from "@/src/store/auth";
import { colors } from "@/src/theme/colors";

export default function SignupScreen() {
  const router = useRouter();
  const [form, setForm] = useState({ gym_name: "", owner_name: "", mobile: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upd = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  const onSubmit = async () => {
    const { gym_name, owner_name, mobile, email, password } = form;
    if (!gym_name || !owner_name || !mobile || !email || !password) {
      setErr("All fields are required");
      return;
    }
    if (password.length < 6) { setErr("Password must be at least 6 characters"); return; }
    setLoading(true); setErr(null);
    try {
      await signup({ gym_name, owner_name, mobile, email: email.trim(), password });
      toast("Welcome to GymFlow!", "success");
      router.replace("/onboarding");
    } catch (e: any) {
      setErr(e?.message || "Signup failed");
      toast(e?.message || "Signup failed", "error");
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.logoMark}><Ionicons name="barbell" size={22} color="#fff" /></View>
            <Text style={styles.brand}>GymFlow</Text>
          </View>

          <Text style={styles.h1}>Create your gym</Text>
          <Text style={styles.sub}>Start managing memberships and never miss a renewal.</Text>

          <Input testID="signup-gym-name-input" label="Gym name" placeholder="Iron Studio" value={form.gym_name} onChangeText={upd("gym_name")} />
          <Input testID="signup-owner-name-input" label="Your name" placeholder="Alex Carter" value={form.owner_name} onChangeText={upd("owner_name")} />
          <Input testID="signup-mobile-input" label="Mobile" placeholder="+91 98765 43210" keyboardType="phone-pad" value={form.mobile} onChangeText={upd("mobile")} />
          <Input testID="signup-email-input" label="Email" placeholder="owner@yourgym.com" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={upd("email")} />
          <Input testID="signup-password-input" label="Password" placeholder="At least 6 characters" secureTextEntry value={form.password} onChangeText={upd("password")} />

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Button title="Create account" onPress={onSubmit} loading={loading} testID="signup-submit-button" />
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerTxt}>Already have an account?</Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity testID="go-to-login-link"><Text style={styles.footerLink}>Sign in</Text></TouchableOpacity>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingTop: 8 },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 32 },
  logoMark: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginRight: 10 },
  brand: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5, color: colors.text },
  h1: { fontSize: 30, fontWeight: "900", color: colors.text, letterSpacing: -1, marginBottom: 6 },
  sub: { fontSize: 15, color: colors.textMuted, marginBottom: 28, lineHeight: 22 },
  err: { color: colors.danger, marginBottom: 12, fontSize: 13 },
  footer: { flexDirection: "row", justifyContent: "center", paddingVertical: 16, gap: 6 },
  footerTxt: { color: colors.textMuted },
  footerLink: { color: colors.text, fontWeight: "700" },
});
