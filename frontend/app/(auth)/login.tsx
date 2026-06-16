import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Input, toast } from "@/src/components/ui";
import { login } from "@/src/store/auth";
import { colors } from "@/src/theme/colors";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email || !password) { setErr("Email and password required"); return; }
    setLoading(true); setErr(null);
    try { await login(email.trim(), password); }
    catch (e: any) { setErr(e?.message || "Login failed"); toast(e?.message || "Login failed", "error"); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.logoMark}>
              <Ionicons name="barbell" size={22} color="#fff" />
            </View>
            <Text style={styles.brand}>GymFlow</Text>
          </View>

          <Text style={styles.h1}>Welcome back</Text>
          <Text style={styles.sub}>Manage memberships, renewals, and reminders for your gym.</Text>

          <View style={styles.form}>
            <Input
              testID="login-email-input"
              label="Email"
              placeholder="owner@yourgym.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Input
              testID="login-password-input"
              label="Password"
              placeholder="••••••••"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {err ? <Text style={styles.err}>{err}</Text> : null}

            <Button title="Sign in" onPress={onSubmit} loading={loading} testID="login-submit-button" />

            <Link href="/(auth)/forgot-password" asChild>
              <TouchableOpacity testID="forgot-password-link" style={styles.linkRow}>
                <Text style={styles.link}>Forgot password?</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerTxt}>New here?</Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity testID="go-to-signup-link"><Text style={styles.footerLink}>Create an account</Text></TouchableOpacity>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingTop: 8, flexGrow: 1 },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 48 },
  logoMark: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginRight: 10 },
  brand: { fontSize: 20, fontWeight: "900", letterSpacing: -0.5, color: colors.text },
  h1: { fontSize: 32, fontWeight: "900", color: colors.text, letterSpacing: -1, marginBottom: 8 },
  sub: { fontSize: 15, color: colors.textMuted, marginBottom: 32, lineHeight: 22 },
  form: { gap: 4 },
  err: { color: colors.danger, marginBottom: 12, fontSize: 13 },
  linkRow: { paddingVertical: 16, alignItems: "center" },
  link: { color: colors.accent, fontWeight: "600" },
  footer: { flexDirection: "row", justifyContent: "center", paddingVertical: 16, gap: 6 },
  footerTxt: { color: colors.textMuted },
  footerLink: { color: colors.text, fontWeight: "700" },
});
