import { Router, Request, Response } from "express";
import { prisma } from "../db.js";

export const orderRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     OrderResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         quotationId:
 *           type: string
 *           format: uuid
 *         designerId:
 *           type: string
 *           format: uuid
 *         customerId:
 *           type: string
 *           format: uuid
 *         status:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         customer:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             fullName:
 *               type: string
 *         quotation:
 *           $ref: '#/components/schemas/QuotationResponse'
 */

/**
 * @openapi
 * /api/designers/{designerId}/orders:
 *   get:
 *     summary: Retrieve Designer Orders
 *     description: Lists orders generated from accepted quotations for a specific designer. Allows filtering by active status (e.g., CONFIRMED, IN_PRODUCTION, COMPLETED).
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: designerId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Optional order status to filter by.
 *     responses:
 *       200:
 *         description: List of designer orders.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/OrderResponse'
 */
orderRouter.get("/designers/:designerId/orders", async (req: Request, res: Response): Promise<any> => {
  try {
    const designerId = req.params.designerId as string;
    const status = req.query.status as string | undefined;

    const designer = await prisma.user.findUnique({ where: { id: designerId } });
    if (!designer) {
      return res.status(404).json({ error: "Designer account not found." });
    }

    const whereClause: any = { designerId };
    if (status) {
      whereClause.status = status;
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        customer: { select: { id: true, fullName: true, profileImageUrl: true } },
        quotation: {
          include: {
            inquiry: {
              include: {
                piece: { select: { id: true, name: true, primaryImageUrl: true } },
                measurementProfile: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json(orders);
  } catch (error: any) {
    console.error("Get designer orders error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
