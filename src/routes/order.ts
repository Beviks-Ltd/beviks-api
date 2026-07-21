import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { invalidateResponseCache, sendCachedJson, uncachedJson } from "../utils/responseCache.js";

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

    return sendCachedJson(req, res, `orders:designer:${designerId}:active`, 8000, async () => {
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

      return orders.map(order => {
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
    });
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

    return sendCachedJson(req, res, `orders:designer:${designerId}:completed`, 15000, async () => {
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

      return orders.map(order => {
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
    });
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

    return sendCachedJson(req, res, `orders:detail:${id}`, 8000, async () => {
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          customer: true,
          timeline: { orderBy: { createdAt: "desc" } },
          designer: {
            select: {
              id: true,
              fullName: true,
              profileImageUrl: true,
              email: true,
              store: {
                select: {
                  id: true,
                  name: true,
                  logoUrl: true,
                  description: true
                }
              }
            }
          },
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
        return uncachedJson(404, { error: "Order not found." });
      }

      const q = order.quotation;
      const totalAmount = Number(q.materialFabricCost) +
                          Number(q.tailoringCraftsmanshipCost) +
                          Number(q.embellishmentCost) +
                          Number(q.fittingCost);

      return {
        id: order.id,
        quotationId: order.quotationId,
        designerId: order.designerId,
        customerId: order.customerId,
        status: order.status,
        progressPercentage: order.progressPercentage,
        technicalSpecs: order.technicalSpecs,
        cancellationReason: order.cancellationReason,
        refundAmount: order.refundAmount ? Number(order.refundAmount) : null,
        refundStatus: order.refundStatus,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        designer: order.designer,
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
        }
      };
    });
  } catch (error: any) {
    console.error("Get order details error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/users/{userId}/orders:
 *   get:
 *     summary: Retrieve Customer Orders
 *     description: Lists all production orders (both active and completed) placed by a customer. Includes designer, storefront details, and sizing quotes.
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of customer orders.
 */
orderRouter.get("/users/:userId/orders", async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.params.userId as string;

    return sendCachedJson(req, res, `orders:customer:${userId}`, 8000, async () => {
      const orders = await prisma.order.findMany({
        where: { customerId: userId },
        include: {
          designer: {
            select: {
              id: true,
              fullName: true,
              profileImageUrl: true,
              store: {
                select: {
                  id: true,
                  name: true,
                  logoUrl: true
                }
              }
            }
          },
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

      return orders.map(order => {
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
          designer: order.designer
        };
      });
    });
  } catch (error: any) {
    console.error("Get customer orders error:", error);
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

      // If status or progress changed, notify Customer
      if (status || progressPercentage !== undefined) {
        await tx.notification.create({
          data: {
            userId: order.customerId,
            type: "ORDERS",
            title: "Order Progress Updated",
            message: `Your order status has been updated to ${status || order.status} (Progress: ${progressPercentage !== undefined ? progressPercentage : order.progressPercentage}%).`,
            referenceId: id
          }
        });
      }

      return updated;
    });

    const refreshedOrder = await prisma.order.findUnique({
      where: { id },
      include: { timeline: { orderBy: { createdAt: "desc" } } }
    });

    invalidateResponseCache("orders:");
    invalidateResponseCache(`notifications:user:${order.customerId}`);

    return res.status(200).json({
      message: "Order updated successfully.",
      order: refreshedOrder
    });
  } catch (error: any) {
    console.error("Update order error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/orders/{id}/adjust-price:
 *   post:
 *     summary: Adjust Order Itemized Pricing
 *     description: Designer modifies the itemized costs (materials, tailoring, embellishment, fitting) for the order's linked quotation and adds a timeline event.
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
 *             required:
 *               - materialFabricCost
 *               - tailoringCraftsmanshipCost
 *               - embellishmentCost
 *               - fittingCost
 *               - adjustmentReason
 *             properties:
 *               materialFabricCost:
 *                 type: number
 *                 example: 400.00
 *               tailoringCraftsmanshipCost:
 *                 type: number
 *                 example: 450.00
 *               embellishmentCost:
 *                 type: number
 *                 example: 120.00
 *               fittingCost:
 *                 type: number
 *                 example: 60.00
 *               adjustmentReason:
 *                 type: string
 *                 example: "Premium silk price increased at vendor."
 *     responses:
 *       200:
 *         description: Price adjusted successfully.
 */
orderRouter.post("/orders/:id/adjust-price", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const { materialFabricCost, tailoringCraftsmanshipCost, embellishmentCost, fittingCost, adjustmentReason } = req.body;

    if (
      materialFabricCost === undefined ||
      tailoringCraftsmanshipCost === undefined ||
      embellishmentCost === undefined ||
      fittingCost === undefined ||
      !adjustmentReason
    ) {
      return res.status(400).json({ error: "All itemized costs and an adjustmentReason are required." });
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: { quotation: true }
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    const oldTotal = Number(order.quotation.materialFabricCost) + 
                     Number(order.quotation.tailoringCraftsmanshipCost) + 
                     Number(order.quotation.embellishmentCost) + 
                     Number(order.quotation.fittingCost);

    const newTotal = Number(materialFabricCost) + 
                     Number(tailoringCraftsmanshipCost) + 
                     Number(embellishmentCost) + 
                     Number(fittingCost);

    const updated = await prisma.$transaction(async (tx) => {
      // Update quotation costs
      await tx.quotation.update({
        where: { id: order.quotationId },
        data: {
          materialFabricCost,
          tailoringCraftsmanshipCost,
          embellishmentCost,
          fittingCost
        }
      });

      // Log to timeline
      await tx.orderTimeline.create({
        data: {
          orderId: id,
          title: "Price Adjusted",
          description: `Total price changed from ${oldTotal.toFixed(2)} to ${newTotal.toFixed(2)}. Reason: ${adjustmentReason}`
        }
      });

      // Notify Customer
      await tx.notification.create({
        data: {
          userId: order.customerId,
          type: "ORDERS",
          title: "Order Price Adjusted",
          message: `Designer adjusted the order total price from ${oldTotal.toFixed(2)} to ${newTotal.toFixed(2)}. Reason: ${adjustmentReason}`,
          amount: newTotal,
          referenceId: id
        }
      });

      return tx.order.findUnique({
        where: { id },
        include: {
          quotation: true,
          timeline: { orderBy: { createdAt: "desc" } }
        }
      });
    });

    invalidateResponseCache("orders:");
    invalidateResponseCache(`notifications:user:${order.customerId}`);

    return res.status(200).json({
      message: "Order pricing adjusted successfully.",
      order: updated
    });
  } catch (error: any) {
    console.error("Adjust price error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/orders/{id}/adjust-schedule:
 *   post:
 *     summary: Adjust Order Delivery Schedule
 *     description: Designer changes the expected completion date for the order's linked quotation and adds a timeline event.
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
 *             required:
 *               - expectedCompletionDate
 *               - scheduleReason
 *             properties:
 *               expectedCompletionDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-09-01T00:00:00.000Z"
 *               scheduleReason:
 *                 type: string
 *                 example: "Shipment of custom embroidery lace was delayed."
 *     responses:
 *       200:
 *         description: Schedule adjusted successfully.
 */
orderRouter.post("/orders/:id/adjust-schedule", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const { expectedCompletionDate, scheduleReason } = req.body;

    if (!expectedCompletionDate || !scheduleReason) {
      return res.status(400).json({ error: "expectedCompletionDate and scheduleReason are required." });
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: { quotation: true }
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    const oldDateStr = order.quotation.expectedCompletionDate.toLocaleDateString();
    const newDate = new Date(expectedCompletionDate);

    const updated = await prisma.$transaction(async (tx) => {
      // Update expectedCompletionDate
      await tx.quotation.update({
        where: { id: order.quotationId },
        data: { expectedCompletionDate: newDate }
      });

      // Log to timeline
      await tx.orderTimeline.create({
        data: {
          orderId: id,
          title: "Schedule Adjusted",
          description: `Delivery date shifted from ${oldDateStr} to ${newDate.toLocaleDateString()}. Reason: ${scheduleReason}`
        }
      });

      // Notify Customer
      await tx.notification.create({
        data: {
          userId: order.customerId,
          type: "ORDERS",
          title: "Order Schedule Shifted",
          message: `Designer adjusted the delivery date from ${oldDateStr} to ${newDate.toLocaleDateString()}. Reason: ${scheduleReason}`,
          referenceId: id
        }
      });

      return tx.order.findUnique({
        where: { id },
        include: {
          quotation: true,
          timeline: { orderBy: { createdAt: "desc" } }
        }
      });
    });

    invalidateResponseCache("orders:");
    invalidateResponseCache(`notifications:user:${order.customerId}`);

    return res.status(200).json({
      message: "Order completion schedule adjusted successfully.",
      order: updated
    });
  } catch (error: any) {
    console.error("Adjust schedule error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/orders/{id}/invoice:
 *   get:
 *     summary: Export Order Invoice Details
 *     description: Returns structured billing details, seller/buyer profile info, itemized quote breakdowns, payments received, and tax breakdowns.
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
 *         description: Printable invoice details JSON.
 */
orderRouter.get("/orders/:id/invoice", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, fullName: true, email: true, phoneNumber: true } },
        designer: { select: { id: true, fullName: true, email: true } },
        quotation: {
          include: {
            inquiry: {
              include: {
                piece: { select: { id: true, name: true } }
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
    const material = Number(q.materialFabricCost);
    const craftsmanship = Number(q.tailoringCraftsmanshipCost);
    const embellishment = Number(q.embellishmentCost);
    const fitting = Number(q.fittingCost);
    const subtotal = material + craftsmanship + embellishment + fitting;

    // Standardized billing invoice calculations
    const taxRate = 0.05; // 5% VAT
    const taxAmount = subtotal * taxRate;
    const grandTotal = subtotal + taxAmount;

    const invoice = {
      invoiceNumber: `INV-${order.id.slice(0, 8).toUpperCase()}`,
      issueDate: order.createdAt,
      dueDate: q.expectedCompletionDate,
      orderStatus: order.status,
      paymentStatus: order.status === "CANCELLED" ? "CANCELLED" : "DEPOSIT_PAID",
      refundAmount: order.refundAmount ? Number(order.refundAmount) : 0,
      refundStatus: order.refundStatus || "N/A",
      designer: {
        designerId: order.designer.id,
        fullName: order.designer.fullName,
        email: order.designer.email,
        companyName: "Beviks Ltd Studio"
      },
      customer: {
        customerId: order.customer.id,
        fullName: order.customer.fullName,
        email: order.customer.email,
        phone: order.customer.phoneNumber
      },
      itemizedItems: [
        { description: "Material & Fabric elements", amount: material },
        { description: "Tailoring & Craftsmanship service", amount: craftsmanship },
        { description: "Embellishments & Detailing work", amount: embellishment },
        { description: "Fitting session & Adjustments", amount: fitting }
      ],
      pricingSummary: {
        subtotal: Number(subtotal.toFixed(2)),
        taxRate: "5%",
        taxAmount: Number(taxAmount.toFixed(2)),
        grandTotal: Number(grandTotal.toFixed(2))
      },
      terms: q.terms,
      depositNotes: q.depositNotes
    };

    return res.status(200).json(invoice);
  } catch (error: any) {
    console.error("Export invoice error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/orders/{id}/cancel:
 *   post:
 *     summary: Request Order Cancellation
 *     description: Cancels the order, updates the state to CANCELLED, stores the reason, and adds a timeline event.
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
 *             required:
 *               - cancellationReason
 *             properties:
 *               cancellationReason:
 *                 type: string
 *                 example: "Fabric supplier is out of stock of requested velvet fabric."
 *     responses:
 *       200:
 *         description: Order cancelled successfully.
 */
orderRouter.post("/orders/:id/cancel", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const { cancellationReason } = req.body;

    if (!cancellationReason) {
      return res.status(400).json({ error: "cancellationReason is required to cancel an order." });
    }

    const order = await prisma.order.findUnique({
      where: { id }
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (order.status === "CANCELLED") {
      return res.status(400).json({ error: "Order has already been cancelled." });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Update order status and reason
      const orderUpdated = await tx.order.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancellationReason
        }
      });

      // Log to timeline
      await tx.orderTimeline.create({
        data: {
          orderId: id,
          title: "Order Cancelled",
          description: `Order was cancelled. Reason: ${cancellationReason}`
        }
      });

      // Notify Customer
      await tx.notification.create({
        data: {
          userId: order.customerId,
          type: "ORDERS",
          title: "Order Cancelled",
          message: `Your order was cancelled by the designer. Reason: ${cancellationReason}`,
          referenceId: id
        }
      });

      return orderUpdated;
    });

    const refreshed = await prisma.order.findUnique({
      where: { id },
      include: { timeline: { orderBy: { createdAt: "desc" } } }
    });

    invalidateResponseCache("orders:");
    invalidateResponseCache(`notifications:user:${order.customerId}`);

    return res.status(200).json({
      message: "Order cancelled successfully.",
      order: refreshed
    });
  } catch (error: any) {
    console.error("Cancel order error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/orders/{id}/refund:
 *   post:
 *     summary: Process Cancelled Order Refund
 *     description: Processes refund details, saves refundStatus to PROCESSED, records the amount, and logs details in the timeline.
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
 *             required:
 *               - refundAmount
 *             properties:
 *               refundAmount:
 *                 type: number
 *                 example: 930.00
 *               notes:
 *                 type: string
 *                 example: "Full deposit refunded via Stripe transaction."
 *     responses:
 *       200:
 *         description: Refund processed successfully.
 */
orderRouter.post("/orders/:id/refund", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const { refundAmount, notes } = req.body;

    if (refundAmount === undefined) {
      return res.status(400).json({ error: "refundAmount is required." });
    }

    const order = await prisma.order.findUnique({
      where: { id }
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (order.status !== "CANCELLED") {
      return res.status(400).json({ error: "Refunds can only be processed on cancelled orders." });
    }

    if (order.refundStatus === "PROCESSED") {
      return res.status(400).json({ error: "Refund has already been processed for this order." });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const orderUpdated = await tx.order.update({
        where: { id },
        data: {
          refundAmount,
          refundStatus: "PROCESSED"
        }
      });

      await tx.orderTimeline.create({
        data: {
          orderId: id,
          title: "Refund Processed",
          description: `Refund of ${Number(refundAmount).toFixed(2)} processed. Notes: ${notes || "None"}.`
        }
      });

      // Notify Customer
      await tx.notification.create({
        data: {
          userId: order.customerId,
          type: "ORDERS",
          title: "Refund Processed",
          message: `A refund of ${Number(refundAmount).toFixed(2)} has been processed for your order. Notes: ${notes || "None"}.`,
          amount: refundAmount,
          referenceId: id
        }
      });

      return orderUpdated;
    });

    const refreshed = await prisma.order.findUnique({
      where: { id },
      include: { timeline: { orderBy: { createdAt: "desc" } } }
    });

    invalidateResponseCache("orders:");
    invalidateResponseCache(`notifications:user:${order.customerId}`);

    return res.status(200).json({
      message: "Refund processed successfully.",
      order: refreshed
    });
  } catch (error: any) {
    console.error("Process refund error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
