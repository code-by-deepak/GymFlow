import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { ToastHost } from "@/src/components/ui";
import { useAuth, useAuthBootstrap } from "@/src/store/auth";

SplashScreen.preventAutoHideAsync();

// Push notification handlers — module scope, NOT inside a component.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { initialized, authenticated, gym } = useAuth();
  const [routed, setRouted] = useState(false);

  useEffect(() => {
    if (!initialized) return;
    const group = segments[0];
    const inAuth = group === "(auth)";
    const inOnboarding = segments[0] === "onboarding";
    if (!authenticated) {
      if (!inAuth) router.replace("/(auth)/login");
    } else if (gym && !gym.onboarding_complete && !inOnboarding) {
      router.replace("/onboarding");
    } else if (authenticated && (inAuth || segments.length === 0)) {
      router.replace("/(tabs)/dashboard");
    }
    setRouted(true);
  }, [initialized, authenticated, gym?.onboarding_complete, segments, router, gym]);

  return null;
}

function PushTapHandlers() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS === "web") return;
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data: any = response.notification.request.content.data || {};
      const url = data.deeplink || data.action_url;
      if (!url) return;
      String(url).startsWith("http") ? Linking.openURL(url) : router.push(url);
    });
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data: any = response.notification.request.content.data || {};
      const url = data.deeplink || data.action_url;
      if (url) {
        String(url).startsWith("http") ? Linking.openURL(url) : router.push(url);
      }
    });
    return () => { tapSub.remove(); };
  }, [router]);
  return null;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  useAuthBootstrap();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthGate />
        <PushTapHandlers />
        <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
