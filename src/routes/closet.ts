import { Router, Request, Response } from "express";
import { prisma } from "../db.js";

export const closetRouter = Router();

/**
 * @openapi
 * /api/closets/user/{userId}:
 *   get:
 *     summary: Retrieve Customer's Closet
 *     description: Returns the list of dress inquiries submitted by a user, including their design details (pieces), quotations from designers (if available), and current inquiry statuses.
 *     tags:
 *       - Closet
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Closet data retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   status:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                   piece:
 *                     $ref: '#/components/schemas/PieceResponse'
 *                   quotation:
 *                     $ref: '#/components/schemas/QuotationResponse'
 */
closetRouter.get("/user/:userId", async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.params.userId as string;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "Customer account not found." });
    }

    const closetItems = await prisma.quoteInquiry.findMany({
      where: { customerId: userId },
      include: {
        piece: {
          include: { images: { orderBy: { order: "asc" } } }
        },
        quotation: true
      },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json(closetItems);
  } catch (error: any) {
    console.error("Get customer closet error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
