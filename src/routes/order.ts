import { Router, Request, Response } from "express";
import { prisma } from "../db.js";

export const orderRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     OrderTimelineResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         orderId:
 *           type: string
 *           format: uuid
 *         title:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *     OrderDetailedResponse:
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
 *         progressPercentage:
 *           type: integer
 *         technicalSpecs:
 *           type: string
 *           nullable: true
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
 *             email:
 *               type: string
 *             phoneNumber:
 *               type: string
 *             gender:
 *               type: string
 *             dateOfBirth:
 *               type: string
 *             profileImageUrl:
 *               type: string
 *               nullable: true
 *         quotation:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             materialFabricCost:
 *               type: number
 *             tailoringCraftsmanshipCost:
 *               type: number
 *             embellishmentCost:
 *               type: number
 *             fittingCost:
 *               type: number
 *             totalQuoteAmount:
 *               type: number
 *             expectedCompletionDate:
 *               type: string
 *               format: date-time
 *             terms:
 *               type: string
 *             depositNotes:
 *               type: string
 *             inquiry:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 piece:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     primaryImageUrl:
 *                       type: string
 *                 measurementProfile:
 *                   $ref: '#/components/schemas/MeasurementProfileResponse'
 *         timeline:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderTimelineResponse'
 */

/**
 * @openapi
 * /api/designers/{designerId}/orders/active:
 *   get:
 *     summary: Retrieve Designer Active Orders
 *     description: Lists all active production orders for a designer (status is QUOTING, SOURCING, or SEWING).
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: designerId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Active orders data.
 */
orderRouter.get("/designers/:designerId/orders/active", async (req: Request, res: Response): Promise<any> => {
  try {
    const designerId = req.params.designerId as string;

    const designer = await prisma.user.findUnique({ where: { id: designerId } });
    if (!designer) {
      return res.status(404).json({ error: "Designer account not found." });
    }

    const orders = await prisma.order.findMany({
      where: {
        designerId,
        status: { in: ["QUOTING", "SOURCING", "SEWING"] }
      },
      include: {
        customer: { select: { id: true, fullName: true, profileImageUrl: true } },
        quotation: {
          include: {
            inquiry: {
              include: {
                piece: { select: { id: true, name: true, primaryImageUrl: true } }
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const formatted = orders.map(order => {
      const q = order.quotation;
      const totalAmount = Number(q.materialFabricCost) + 
                          Number(q.tailoringCraftsmanshipCost) + 
                          Number(q.embellishmentCost) + 
                          Number(q.fittingCost);
      return {
        orderId: order.id,
        status: order.status,
        progressPercentage: order.progressPercentage,
        acceptedDate: order.createdAt,
        estimatedDelivery: q.expectedCompletionDate,
        totalQuoteAmount: totalAmount,
        pieceName: q.inquiry.piece.name,
        pieceImageUrl: q.inquiry.piece.primaryImageUrl,
        customerName: order.customer.fullName,
        customerAvatarUrl: order.customer.profileImageUrl
      };
    });

    return res.status(200).json(formatted);
  } catch (error: any) {
    console.error("Get active orders error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/designers/{designerId}/orders/completed:
 *   get:
 *     summary: Retrieve Designer Completed Orders
 *     description: Lists all completed and delivered orders for a designer (status is DELIVERY).
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: designerId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Completed orders data.
 */
orderRouter.get("/designers/:designerId/orders/completed", async (req: Request, res: Response): Promise<any> => {
  try {
    const designerId = req.params.designerId as string;

    const designer = await prisma.user.findUnique({ where: { id: designerId } });
    if (!designer) {
      return res.status(404).json({ error: "Designer account not found." });
    }

    const orders = await prisma.order.findMany({
      where: {
        designerId,
        status: "DELIVERY"
      },
      include: {
        customer: { select: { id: true, fullName: true, profileImageUrl: true } },
        quotation: {
          include: {
            inquiry: {
              include: {
                piece: { select: { id: true, name: true, primaryImageUrl: true } }
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const formatted = orders.map(order => {
      const q = order.quotation;
      const totalAmount = Number(q.materialFabricCost) + 
                          Number(q.tailoringCraftsmanshipCost) + 
                          Number(q.embellishmentCost) + 
                          Number(q.fittingCost);
      return {
        orderId: order.id,
        status: order.status,
        progressPercentage: order.progressPercentage,
        acceptedDate: order.createdAt,
        estimatedDelivery: q.expectedCompletionDate,
        totalQuoteAmount: totalAmount,
        pieceName: q.inquiry.piece.name,
        pieceImageUrl: q.inquiry.piece.primaryImageUrl,
        customerName: order.customer.fullName,
        customerAvatarUrl: order.customer.profileImageUrl
      };
    });

    return res.status(200).json(formatted);
  } catch (error: any) {
    console.error("Get completed orders error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/orders/{id}:
 *   get:
 *     summary: Retrieve Order Details
 *     description: Returns detailed fields for a specific order, including itemized accepted quotations, customer details, measurement specs, and the timeline entries.
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Detailed order data.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OrderDetailedResponse'
 */
orderRouter.get("/orders/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        timeline: { orderBy: { createdAt: "desc" } },
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
      }
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    const q = order.quotation;
    const totalAmount = Number(q.materialFabricCost) + 
                        Number(q.tailoringCraftsmanshipCost) + 
                        Number(q.embellishmentCost) + 
                        Number(q.fittingCost);

    const detailed = {
      id: order.id,
      quotationId: order.quotationId,
      designerId: order.designerId,
      customerId: order.customerId,
      status: order.status,
      progressPercentage: order.progressPercentage,
      technicalSpecs: order.technicalSpecs,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      customer: {
        id: order.customer.id,
        fullName: order.customer.fullName,
        email: order.customer.email,
        phoneNumber: order.customer.phoneNumber,
        gender: order.customer.gender,
        dateOfBirth: order.customer.dateOfBirth,
        profileImageUrl: order.customer.profileImageUrl
      },
      quotation: {
        id: q.id,
        materialFabricCost: Number(q.materialFabricCost),
        tailoringCraftsmanshipCost: Number(q.tailoringCraftsmanshipCost),
        embellishmentCost: Number(q.embellishmentCost),
        fittingCost: Number(q.fittingCost),
        totalQuoteAmount: totalAmount,
        expectedCompletionDate: q.expectedCompletionDate,
        terms: q.terms,
        depositNotes: q.depositNotes,
        inquiry: {
          id: q.inquiry.id,
          piece: q.inquiry.piece,
          measurementProfile: q.inquiry.measurementProfile
        }
      },
      timeline: order.timeline
    };

    return res.status(200).json(detailed);
  } catch (error: any) {
    console.error("Get order details error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/orders/{id}:
 *   put:
 *     summary: Update Order Status and Progress
 *     description: Designer updates the production state of an order (status values - QUOTING, SOURCING, SEWING, DELIVERY), alters the progress, writes technical specs, and appends a timeline entry.
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [QUOTING, SOURCING, SEWING, DELIVERY]
 *                 example: SOURCING
 *               progressPercentage:
 *                 type: integer
 *                 example: 25
 *               technicalSpecs:
 *                 type: string
 *                 example: "Using 5 yards of pure silk. Added lining to bust panel."
 *               timelineTitle:
 *                 type: string
 *                 example: "Fabric Sourced"
 *               timelineDescription:
 *                 type: string
 *                 example: "Premium silk and thread elements acquired from fabric vendor."
 *     responses:
 *       200:
 *         description: Order successfully updated.
 */
orderRouter.put("/orders/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const { status, progressPercentage, technicalSpecs, timelineTitle, timelineDescription } = req.body;

    const order = await prisma.order.findUnique({
      where: { id }
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (status && !["QUOTING", "SOURCING", "SEWING", "DELIVERY"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value. Must be one of QUOTING, SOURCING, SEWING, DELIVERY." });
    }

    const updatedData: any = {};
    if (status) updatedData.status = status;
    if (progressPercentage !== undefined) updatedData.progressPercentage = Number(progressPercentage);
    if (technicalSpecs !== undefined) updatedData.technicalSpecs = technicalSpecs;

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: updatedData,
        include: { timeline: true }
      });

      // If a timeline title is provided, log it
      if (timelineTitle) {
        await tx.orderTimeline.create({
          data: {
            orderId: id,
            title: timelineTitle,
            description: timelineDescription || `Status changed to ${status || order.status}.`
          }
        });
      } else if (status && status !== order.status) {
        // Automatic log for status changes if no custom title sent
        await tx.orderTimeline.create({
          data: {
            orderId: id,
            title: `Status set to ${status}`,
            description: `Order production status changed from ${order.status} to ${status}.`
          }
        });
      }

      return updated;
    });

    const refreshedOrder = await prisma.order.findUnique({
      where: { id },
      include: { timeline: { orderBy: { createdAt: "desc" } } }
    });

    return res.status(200).json({
      message: "Order updated successfully.",
      order: refreshedOrder
    });
  } catch (error: any) {
    console.error("Update order error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
