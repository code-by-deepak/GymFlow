import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Input, toast } from "@/src/components/ui";
import { authApi } from "@/src/api/client";
import { colors } from "@/src/theme/colors";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [step, setStep] = useState<"request" | "reset">("request");
  const [loading, setLoading] = useState(false);

  const onRequest = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await authApi.forgot(email.trim());
      toast(res.message, "info");
      setStep("reset");
    } catch (e: any) { toast(e?.message || "Failed", "error"); }
    finally { setLoading(false); }
  };

  const onReset = async () => {
    if (!token || !pw) return;
    setLoading(true);
    try {
      await authApi.reset(token.trim(), pw);
      toast("Password reset. Please sign in.", "success");
      router.replace("/(auth)/login");
    } catch (e: any) { toast(e?.message || "Reset failed", "error"); }
    finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={() => router.back()} style={styles.back} testID="back-button">
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.h1}>{step === "request" ? "Reset password" : "Enter new password"}</Text>
          <Text style={styles.sub}>
            {step === "request"
              ? "We'll send a reset link to your email. (In dev, the token is printed in the server logs.)"
              : "Paste the reset token from your email and choose a new password."}
          </Text>

          {step === "request" ? (
            <>
              <Input testID="forgot-email-input" label="Email" placeholder="owner@yourgym.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
              <Button title="Send reset link" onPress={onRequest} loading={loading} testID="forgot-submit-button" />
            </>
          ) : (
            <>
              <Input testID="reset-token-input" label="Reset token" placeholder="Paste token here" autoCapitalize="none" value={token} onChangeText={setToken} />
              <Input testID="reset-password-input" label="New password" placeholder="At least 6 characters" secureTextEntry value={pw} onChangeText={setPw} />
              <Button title="Reset password" onPress={onReset} loading={loading} testID="reset-submit-button" />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingTop: 8 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginBottom: 24 },
  h1: { fontSize: 28, fontWeight: "900", color: colors.text, letterSpacing: -1, marginBottom: 6 },
  sub: { fontSize: 14, color: colors.textMuted, marginBottom: 28, lineHeight: 20 },
});
