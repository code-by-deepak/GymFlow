import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/store/auth";
import { colors } from "@/src/theme/colors";

export default function Index() {
  const router = useRouter();
  const { initialized, authenticated, gym } = useAuth();

  useEffect(() => {
    if (!initialized) return;
    if (!authenticated) router.replace("/(auth)/login");
    else if (gym && !gym.onboarding_complete) router.replace("/onboarding");
    else router.replace("/(tabs)/dashboard");
  }, [initialized, authenticated, gym, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
});
