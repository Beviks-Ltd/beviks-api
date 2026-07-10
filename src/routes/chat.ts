import { Router, Request, Response } from "express";
import { prisma } from "../db.js";

export const chatRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     ChatMessageResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         roomId:
 *           type: string
 *           format: uuid
 *         senderId:
 *           type: string
 *           format: uuid
 *         content:
 *           type: string
 *         mediaUrl:
 *           type: string
 *           nullable: true
 *         isDeleted:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *     ChatRoomResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         user1Id:
 *           type: string
 *           format: uuid
 *         user2Id:
 *           type: string
 *           format: uuid
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         user1:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             fullName:
 *               type: string
 *             profileImageUrl:
 *               type: string
 *               nullable: true
 *         user2:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             fullName:
 *               type: string
 *             profileImageUrl:
 *               type: string
 *               nullable: true
 *         lastMessage:
 *           $ref: '#/components/schemas/ChatMessageResponse'
 *           nullable: true
 */

/**
 * @openapi
 * /api/chats/initialize:
 *   post:
 *     summary: Initialize 1-to-1 Chat Room
 *     description: Creates or retrieves a 1-to-1 conversation room between two users (e.g. customer and designer).
 *     tags:
 *       - Chats
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - user1Id
 *               - user2Id
 *             properties:
 *               user1Id:
 *                 type: string
 *                 format: uuid
 *                 example: e634127c-9b76-47ee-8cd6-c67ee59d9972
 *               user2Id:
 *                 type: string
 *                 format: uuid
 *                 example: a5941a7c-9b76-47ee-8cd6-c67ee59d9972
 *     responses:
 *       200:
 *         description: Chat room initialized.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatRoomResponse'
 */
chatRouter.post("/chats/initialize", async (req: Request, res: Response): Promise<any> => {
  try {
    const { user1Id, user2Id } = req.body;

    if (!user1Id || !user2Id) {
      return res.status(400).json({ error: "user1Id and user2Id are required." });
    }

    if (user1Id === user2Id) {
      return res.status(400).json({ error: "Cannot create a chat room with oneself." });
    }

    // Sort to keep user order consistent
    const [u1, u2] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];

    // Find or create
    let room = await prisma.chatRoom.findUnique({
      where: {
        user1Id_user2Id: { user1Id: u1, user2Id: u2 }
      },
      include: {
        user1: { select: { id: true, fullName: true, profileImageUrl: true } },
        user2: { select: { id: true, fullName: true, profileImageUrl: true } }
      }
    });

    if (!room) {
      room = await prisma.chatRoom.create({
        data: {
          user1Id: u1,
          user2Id: u2
        },
        include: {
          user1: { select: { id: true, fullName: true, profileImageUrl: true } },
          user2: { select: { id: true, fullName: true, profileImageUrl: true } }
        }
      });
    }

    return res.status(200).json(room);
  } catch (error: any) {
    console.error("Initialize chat room error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/chats/user/{userId}:
 *   get:
 *     summary: Retrieve User's Active Chat Rooms
 *     description: Returns a list of all active conversations rooms belonging to a user, including participant details and the last message sent.
 *     tags:
 *       - Chats
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User chat rooms list.
 */
chatRouter.get("/chats/user/:userId", async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.params.userId as string;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const rooms = await prisma.chatRoom.findMany({
      where: {
        OR: [
          { user1Id: userId },
          { user2Id: userId }
        ]
      },
      include: {
        user1: { select: { id: true, fullName: true, profileImageUrl: true } },
        user2: { select: { id: true, fullName: true, profileImageUrl: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    const formattedRooms = rooms.map(room => {
      const lastMessage = room.messages[0] || null;
      return {
        id: room.id,
        user1Id: room.user1Id,
        user2Id: room.user2Id,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        user1: room.user1,
        user2: room.user2,
        lastMessage
      };
    });

    return res.status(200).json(formattedRooms);
  } catch (error: any) {
    console.error("Get user chat rooms error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/chats/room/{roomId}/messages:
 *   get:
 *     summary: Get Chat Room Messages History
 *     description: Retrieves the chronological log of messages within a conversation room.
 *     tags:
 *       - Chats
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Message history list.
 */
chatRouter.get("/chats/room/:roomId/messages", async (req: Request, res: Response): Promise<any> => {
  try {
    const roomId = req.params.roomId as string;

    const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) {
      return res.status(404).json({ error: "Chat room not found." });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: "asc" }
    });

    return res.status(200).json(messages);
  } catch (error: any) {
    console.error("Get chat messages error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/messages/{id}:
 *   delete:
 *     summary: Soft Delete Message (Delete Chat)
 *     description: Toggles a message's state to deleted (redacts the message content).
 *     tags:
 *       - Chats
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Message soft deleted.
 */
chatRouter.delete("/messages/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const msg = await prisma.chatMessage.findUnique({ where: { id } });
    if (!msg) {
      return res.status(404).json({ error: "Message not found." });
    }

    const updated = await prisma.chatMessage.update({
      where: { id },
      data: {
        isDeleted: true,
        content: "This message was deleted."
      }
    });

    return res.status(200).json({ message: "Message deleted successfully.", chatMessage: updated });
  } catch (error: any) {
    console.error("Delete message error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
