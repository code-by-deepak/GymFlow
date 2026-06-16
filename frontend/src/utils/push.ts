// Registers the device for push notifications.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { api } from "@/src/api/client";

export async function registerForPush(userId: string) {
  if (Platform.OS === "web") return;
  if (!Device.isDevice) return;
  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== "granted" && existing.canAskAgain) {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await api.post("/register-push", {
      user_id: userId,
      platform: Platform.OS,
      device_token: tokenResp.data,
    });
  } catch (e) {
    // Silent — push registration is non-blocking
    console.log("[push] register failed", e);
  }
}
