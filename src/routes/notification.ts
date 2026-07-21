import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { invalidateResponseCache, sendCachedJson } from "../utils/responseCache.js";

export const notificationRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     NotificationResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         userId:
 *           type: string
 *           format: uuid
 *         type:
 *           type: string
 *           enum: [ORDERS, SOCIALS]
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         amount:
 *           type: number
 *           nullable: true
 *         referenceId:
 *           type: string
 *           nullable: true
 *         isRead:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @openapi
 * /api/notifications/user/{userId}:
 *   get:
 *     summary: Get User Notifications
 *     description: Retrieves all notifications for a specific user (customer or designer). Supports filtering by type (ORDERS or SOCIALS) and outputs detailed logs including money amounts where applicable.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [ORDERS, SOCIALS]
 *         description: Optional type filter (ORDERS, SOCIALS).
 *     responses:
 *       200:
 *         description: List of user notifications.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/NotificationResponse'
 */
async function getUserNotifications(req: Request, res: Response): Promise<any> {
  try {
    const userId = req.params.userId as string;
    const type = req.query.type as string | undefined;

    const whereClause: any = { userId };
    if (type) {
      if (!["ORDERS", "SOCIALS"].includes(type)) {
        return res.status(400).json({ error: "Invalid type parameter. Must be ORDERS or SOCIALS." });
      }
      whereClause.type = type;
    }

    return sendCachedJson(req, res, `notifications:user:${userId}:${type || "all"}`, 10000, async () => {
      const notifications = await prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        take: 80
      });

      return notifications.map(n => ({
        id: n.id,
        userId: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        amount: n.amount ? Number(n.amount) : null,
        referenceId: n.referenceId,
        isRead: n.isRead,
        createdAt: n.createdAt
      }));
    });
  } catch (error: any) {
    console.error("Get notifications error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

notificationRouter.get("/notifications/user/:userId", getUserNotifications);
notificationRouter.get("/user/:userId", getUserNotifications);

/**
 * @openapi
 * /api/notifications/{id}/read:
 *   post:
 *     summary: Mark Notification as Read
 *     description: Toggles a notification's isRead state to true.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Notification marked as read.
 */
notificationRouter.post("/notifications/:id/read", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification) {
      return res.status(404).json({ error: "Notification not found." });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });

    invalidateResponseCache(`notifications:user:${updated.userId}`);

    return res.status(200).json({
      message: "Notification marked as read successfully.",
      notification: {
        ...updated,
        amount: updated.amount ? Number(updated.amount) : null
      }
    });
  } catch (error: any) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/notifications/user/{userId}/read-all:
 *   post:
 *     summary: Mark All Notifications as Read
 *     description: Marks all unread notifications for a specific user as read.
 *     tags:
 *       - Notifications
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: All notifications marked as read.
 */
notificationRouter.post("/notifications/user/:userId/read-all", async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.params.userId as string;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User account not found." });
    }

    const updated = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });

    invalidateResponseCache(`notifications:user:${userId}`);

    return res.status(200).json({
      message: `Successfully marked all unread notifications as read.`,
      count: updated.count
    });
  } catch (error: any) {
    console.error("Mark all notifications read error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/notifications/register-token:
 *   post:
 *     summary: Register Expo Push Token
 *     description: Associates an Expo Push Token with a user account for real-time mobile push notifications.
 *     tags:
 *       - Notifications
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - token
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Push token registered successfully.
 */
notificationRouter.post("/register-token", async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, token } = req.body;

    if (!userId || !token) {
      return res.status(400).json({ error: "userId and token are required parameters." });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User account not found." });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { expoPushToken: token }
    });

    return res.status(200).json({ message: "Expo Push Token registered successfully." });
  } catch (error: any) {
    console.error("Register push token error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
