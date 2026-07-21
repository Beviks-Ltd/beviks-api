import { prisma } from "../db.js";

export async function sendPushNotification(expoPushToken: string, title: string, body: string, data?: any) {
  const isExpoToken = expoPushToken?.startsWith("ExponentPushToken") || expoPushToken?.startsWith("ExpoPushToken");
  if (!isExpoToken) {
    console.log(`[Push Notification Simulation] Invalid/Missing Token: ${expoPushToken} | Title: ${title}`);
    return;
  }

  try {
    const res = await fetch("https://api.expo.dev/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: expoPushToken,
        title,
        body,
        data: data || {},
        sound: "default",
        channelId: "default",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Expo Push Error]", res.status, errText);
    } else {
      console.log(`[Expo Push Success] Notification sent to token ${expoPushToken}`);
    }
  } catch (error) {
    console.error("[Expo Push Exception]", error);
  }
}

export async function sendPushToUser(userId: string, title: string, body: string, data?: any) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { expoPushToken: true }
    });

    if (user?.expoPushToken) {
      await sendPushNotification(user.expoPushToken, title, body, data);
    } else {
      console.log(`[Push Notification Simulation] User ${userId} has no active Expo Push Token.`);
    }
  } catch (error) {
    console.error("[SendPushToUser Exception]", error);
  }
}
