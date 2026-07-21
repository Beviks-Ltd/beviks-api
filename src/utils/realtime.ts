import type { Server } from "socket.io";
import { prisma } from "../db.js";

let io: Server | null = null;

export function setRealtimeServer(server: Server) {
  io = server;
}

export function userNotificationRoom(userId: string) {
  return `user:${userId}`;
}

export async function emitNotificationCount(userId: string) {
  if (!io || !userId) return;

  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false }
  });

  io.to(userNotificationRoom(userId)).emit("notification_count_updated", {
    userId,
    unreadCount
  });
}

export async function emitNotificationCreated(userId: string, notification?: any) {
  if (!io || !userId) return;

  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false }
  });

  io.to(userNotificationRoom(userId)).emit("notification_created", {
    userId,
    unreadCount,
    notification
  });
  io.to(userNotificationRoom(userId)).emit("notification_count_updated", {
    userId,
    unreadCount
  });
}
