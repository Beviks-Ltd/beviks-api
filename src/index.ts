import { createServer } from "http";
import { Server } from "socket.io";
import { app } from "./server.js";
import { prisma } from "./db.js";
import { startWeeklyAccountCleanupCron } from "./utils/cron.js";
import { invalidateResponseCache } from "./utils/responseCache.js";

// Initialize Weekly Account Cleanup Cron Job
startWeeklyAccountCleanupCron();

const PORT = process.env.PORT || 3000;
const server = createServer(app);

// Bind Socket.io to the HTTP Server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const onlineUsers = new Map<string, string>();

io.on("connection", (socket) => {
  console.log(`[Socket Connected] Client ID: ${socket.id}`);

  socket.on("user_online", (data: { userId: string }) => {
    if (!data?.userId) return;
    onlineUsers.set(data.userId, socket.id);
    io.emit("online_users", Array.from(onlineUsers.keys()));
    console.log(`[Socket Online] User ${data.userId} is online`);
  });

  // Event: Join active room
  socket.on("join_room", (roomId: string) => {
    socket.join(roomId);
    console.log(`[Socket Join] Client ${socket.id} joined room ${roomId}`);
  });

  // Event: Send Message (Stores in DB, updates timestamp, broadcasts to participants)
  socket.on("send_message", async (data: { roomId: string; senderId: string; content: string; mediaUrl?: string }) => {
    try {
      const { roomId, senderId, content, mediaUrl } = data;

      if (!roomId || !senderId || (!content && !mediaUrl)) {
        console.error("[Socket Message Error] Missing message parameters.");
        return;
      }

      // Save to database
      const message = await prisma.chatMessage.create({
        data: {
          roomId,
          senderId,
          content,
          mediaUrl: mediaUrl || null
        },
        include: {
          sender: { select: { id: true, fullName: true } }
        }
      });

      // Update room timestamp for sorting lists
      const room = await prisma.chatRoom.update({
        where: { id: roomId },
        data: { updatedAt: new Date() },
        select: { user1Id: true, user2Id: true }
      });

      invalidateResponseCache(`chats:room:${roomId}:messages`);
      invalidateResponseCache(`chats:user:${room.user1Id}`);
      invalidateResponseCache(`chats:user:${room.user2Id}`);

      // Broadcast to room
      io.to(roomId).emit("receive_message", message);
      console.log(`[Socket Message] Sent message in room ${roomId} by ${senderId}`);
    } catch (err) {
      console.error("[Socket Message Save Error]", err);
    }
  });

  // Event: Delete Message (Soft delete, redacts content, broadcasts)
  socket.on("delete_message", async (data: { messageId: string; roomId: string }) => {
    try {
      const { messageId, roomId } = data;

      if (!messageId || !roomId) {
        console.error("[Socket Delete Error] Missing delete parameters.");
        return;
      }

      const updated = await prisma.chatMessage.update({
        where: { id: messageId },
        data: {
          isDeleted: true,
          content: "This message was deleted."
        }
      });

      invalidateResponseCache(`chats:room:${roomId}:messages`);
      invalidateResponseCache("chats:user:");

      // Broadcast deletion
      io.to(roomId).emit("message_deleted", updated);
      console.log(`[Socket Delete] Deleted message ${messageId} in room ${roomId}`);
    } catch (err) {
      console.error("[Socket Delete Save Error]", err);
    }
  });

  // Call Signaling: Initiate Calling (Audio / Video)
  socket.on("call_initiate", (data: { roomId: string; callerId: string; type: "AUDIO" | "VIDEO" }) => {
    const { roomId, callerId, type } = data;
    socket.to(roomId).emit("incoming_call", { roomId, callerId, type });
    console.log(`[Call Initiate] Caller ${callerId} started ${type} call in room ${roomId}`);
  });

  // Call Signaling: Accept Call
  socket.on("call_accept", (data: { roomId: string; userId: string }) => {
    const { roomId, userId } = data;
    socket.to(roomId).emit("call_accepted", { roomId, userId });
    console.log(`[Call Accept] User ${userId} accepted call in room ${roomId}`);
  });

  // Call Signaling: Reject Call
  socket.on("call_reject", (data: { roomId: string; userId: string }) => {
    const { roomId, userId } = data;
    socket.to(roomId).emit("call_rejected", { roomId, userId });
    console.log(`[Call Reject] User ${userId} rejected call in room ${roomId}`);
  });

  // Call Signaling: End Call
  socket.on("call_end", (data: { roomId: string; userId: string }) => {
    const { roomId, userId } = data;
    socket.to(roomId).emit("call_ended", { roomId, userId });
    console.log(`[Call End] User ${userId} ended call in room ${roomId}`);
  });

  socket.on("disconnect", () => {
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
    io.emit("online_users", Array.from(onlineUsers.keys()));
    console.log(`[Socket Disconnected] Client ID: ${socket.id}`);
  });
});

// Boot HTTP Server
server.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`===================================================`);
  console.log(`🚀 Beviks API server running at http://0.0.0.0:${PORT}`);
  console.log(`📝 Swagger Docs available at http://localhost:${PORT}/api-docs`);
  console.log(`===================================================`);
});
