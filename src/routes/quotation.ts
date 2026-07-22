import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { sendPushToUser } from "../utils/push.js";
import { buildBeviksEmailHtml, sendEmail } from "../utils/email.js";
import { invalidateResponseCache, sendCachedJson, uncachedJson } from "../utils/responseCache.js";
import { runInBackground } from "../utils/asyncTasks.js";
import { emitNotificationCreated } from "../utils/realtime.js";

export const quotationRouter = Router();

function quotationTotal(quotation: {
  materialFabricCost: any;
  tailoringCraftsmanshipCost: any;
  embellishmentCost: any;
  fittingCost: any;
}) {
  return Number(quotation.materialFabricCost) +
    Number(quotation.tailoringCraftsmanshipCost) +
    Number(quotation.embellishmentCost) +
    Number(quotation.fittingCost);
}

function briefReason(reason: string, maxLength = 120) {
  return reason.length > maxLength ? `${reason.slice(0, maxLength - 3)}...` : reason;
}

async function sendQuotationEmail({
  to,
  userName,
  title,
  bodyText,
  buttonText,
  buttonUrl,
}: {
  to?: string | null;
  userName?: string | null;
  title: string;
  bodyText: string;
  buttonText?: string;
  buttonUrl?: string;
}) {
  if (!to) return;
  try {
    await sendEmail({
      to,
      subject: title,
      text: bodyText,
      html: buildBeviksEmailHtml({
        title,
        userName: userName || undefined,
        bodyText,
        buttonText,
        buttonUrl,
      }),
    });
  } catch (error) {
    console.error("Quotation email error:", error);
  }
}

/**
 * @openapi
 * components:
 *   schemas:
 *     QuotationResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         inquiryId:
 *           type: string
 *           format: uuid
 *         materialFabricCost:
 *           type: number
 *         tailoringCraftsmanshipCost:
 *           type: number
 *         embellishmentCost:
 *           type: number
 *         fittingCost:
 *           type: number
 *         expectedCompletionDate:
 *           type: string
 *           format: date-time
 *         terms:
 *           type: string
 *           nullable: true
 *         depositNotes:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @openapi
 * /api/inquiries/{inquiryId}/quotation:
 *   post:
 *     summary: Submit Designer Quotation for Inquiry
 *     description: Designer issues an itemized cost estimate and terms (materials, craftsmanship, embellishments, fitting, date) for a specific customer inquiry.
 *     tags:
 *       - Quotations
 *     parameters:
 *       - in: path
 *         name: inquiryId
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
 *               - expectedCompletionDate
 *             properties:
 *               materialFabricCost:
 *                 type: number
 *                 example: 350.00
 *               tailoringCraftsmanshipCost:
 *                 type: number
 *                 example: 400.00
 *               embellishmentCost:
 *                 type: number
 *                 example: 100.00
 *               fittingCost:
 *                 type: number
 *                 example: 50.00
 *               expectedCompletionDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-08-15T00:00:00.000Z"
 *               terms:
 *                 type: string
 *                 example: "50% deposit required to begin production."
 *               depositNotes:
 *                 type: string
 *                 example: "Remaining balance is due upon fitting approval."
 *     responses:
 *       201:
 *         description: Quotation successfully submitted.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QuotationResponse'
 *       400:
 *         description: Missing fields or quotation already exists.
 *       404:
 *         description: Inquiry not found.
 */
quotationRouter.post("/inquiries/:inquiryId/quotation", async (req: Request, res: Response): Promise<any> => {
  try {
    const inquiryId = req.params.inquiryId as string;
    const {
      materialFabricCost,
      tailoringCraftsmanshipCost,
      embellishmentCost,
      fittingCost,
      expectedCompletionDate,
      terms,
      depositNotes
    } = req.body;

    if (
      materialFabricCost === undefined ||
      tailoringCraftsmanshipCost === undefined ||
      embellishmentCost === undefined ||
      fittingCost === undefined ||
      !expectedCompletionDate
    ) {
      return res.status(400).json({ error: "Missing required itemized cost parameters." });
    }

    const inquiry = await prisma.quoteInquiry.findUnique({
      where: { id: inquiryId },
      include: { 
        quotation: true,
        piece: { select: { name: true } },
        customer: { select: { id: true, fullName: true, email: true } },
        designer: { select: { id: true, fullName: true, email: true, store: { select: { name: true } } } }
      }
    });

    if (!inquiry) {
      return res.status(404).json({ error: "Inquiry not found." });
    }

    if (inquiry.quotation) {
      return res.status(400).json({ error: "A quotation has already been submitted for this inquiry." });
    }

    const quotation = await prisma.$transaction(async (tx) => {
      const created = await tx.quotation.create({
        data: {
          inquiryId,
          materialFabricCost,
          tailoringCraftsmanshipCost,
          embellishmentCost,
          fittingCost,
          expectedCompletionDate: new Date(expectedCompletionDate),
          terms,
          depositNotes,
          status: "PENDING"
        }
      });

      await tx.quoteInquiry.update({
        where: { id: inquiryId },
        data: { status: "QUOTED" }
      });

      return created;
    });

    const totalCost = quotationTotal(quotation);
    const designerName = inquiry.designer?.store?.name || inquiry.designer?.fullName || "Your Beviks designer";
    const quoteUrl = `beviksmobile://designer/quote-acceptance?quotationId=${quotation.id}`;
    const notificationMessage = `Designer has submitted a quote totaling ${totalCost.toFixed(2)} for your inquiry on piece '${inquiry.piece.name}'.`;

    invalidateResponseCache("quotations:");
    invalidateResponseCache("inquiries:");
    invalidateResponseCache(`closets:user:${inquiry.customerId}`);

    runInBackground("quotation.created.notifications", async () => {
      await prisma.notification.create({
        data: {
          userId: inquiry.customerId,
          type: "ORDERS",
          title: "New Quotation Received",
          message: notificationMessage,
          amount: totalCost,
          referenceId: quotation.id
        }
      });
      invalidateResponseCache(`notifications:user:${inquiry.customerId}`);
      await emitNotificationCreated(inquiry.customerId);

      await sendPushToUser(
        inquiry.customerId,
        "New Quotation Received",
        notificationMessage,
        { url: `/designer/quote-acceptance?quotationId=${quotation.id}`, type: "quotation", quotationId: quotation.id }
      );

      await sendQuotationEmail({
        to: inquiry.customer?.email,
        userName: inquiry.customer?.fullName,
        title: "New Quotation Received",
        bodyText: `${designerName} has sent a quote totaling ${totalCost.toFixed(2)} for '${inquiry.piece.name}'. Review it in Beviks to accept, decline, or message the designer.`,
        buttonText: "VIEW QUOTATION",
        buttonUrl: quoteUrl,
      });
    });

    return res.status(201).json(quotation);
  } catch (error: any) {
    console.error("Create quotation error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

quotationRouter.get("/designers/:designerId/quotations", async (req: Request, res: Response): Promise<any> => {
  try {
    const designerId = req.params.designerId as string;
    const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : undefined;

    return sendCachedJson(req, res, `quotations:designer:${designerId}:${status || "PENDING"}`, 8000, async () => {
      const quotations = await prisma.quotation.findMany({
        where: {
          ...(status ? { status } : { status: "PENDING" }),
          inquiry: { designerId }
        },
        include: {
          order: true,
          inquiry: {
            include: {
              customer: { select: { id: true, fullName: true, profileImageUrl: true } },
              designer: {
                select: {
                  id: true,
                  fullName: true,
                  profileImageUrl: true,
                  store: { select: { id: true, name: true, logoUrl: true, description: true } }
                }
              },
              piece: { select: { id: true, name: true, primaryImageUrl: true } },
              measurementProfile: true,
              inspirations: true
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });

      return quotations.map((quotation) => {
        const totalQuoteAmount = Number(quotation.materialFabricCost) +
          Number(quotation.tailoringCraftsmanshipCost) +
          Number(quotation.embellishmentCost) +
          Number(quotation.fittingCost);

        return {
          ...quotation,
          materialFabricCost: Number(quotation.materialFabricCost),
          tailoringCraftsmanshipCost: Number(quotation.tailoringCraftsmanshipCost),
          embellishmentCost: Number(quotation.embellishmentCost),
          fittingCost: Number(quotation.fittingCost),
          totalQuoteAmount,
          depositAmount: totalQuoteAmount / 2
        };
      });
    });
  } catch (error: any) {
    console.error("Get designer quotations error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

quotationRouter.get("/quotations/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    return sendCachedJson(req, res, `quotations:detail:${id}`, 8000, async () => {
      const quotation = await prisma.quotation.findUnique({
        where: { id },
        include: {
          order: true,
          inquiry: {
            include: {
              customer: { select: { id: true, fullName: true, profileImageUrl: true } },
              designer: {
                select: {
                  id: true,
                  fullName: true,
                  profileImageUrl: true,
                  store: { select: { id: true, name: true, logoUrl: true, description: true } }
                }
              },
              piece: { select: { id: true, name: true, primaryImageUrl: true } },
              measurementProfile: true
            }
          }
        }
      });

      if (!quotation) {
        return uncachedJson(404, { error: "Quotation not found." });
      }

      const totalQuoteAmount = Number(quotation.materialFabricCost) +
        Number(quotation.tailoringCraftsmanshipCost) +
        Number(quotation.embellishmentCost) +
        Number(quotation.fittingCost);

      return {
        ...quotation,
        materialFabricCost: Number(quotation.materialFabricCost),
        tailoringCraftsmanshipCost: Number(quotation.tailoringCraftsmanshipCost),
        embellishmentCost: Number(quotation.embellishmentCost),
        fittingCost: Number(quotation.fittingCost),
        totalQuoteAmount,
        depositAmount: totalQuoteAmount / 2
      };
    });
  } catch (error: any) {
    console.error("Get quotation error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

quotationRouter.put("/quotations/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const {
      materialFabricCost,
      tailoringCraftsmanshipCost,
      embellishmentCost,
      fittingCost,
      expectedCompletionDate,
      terms,
      depositNotes
    } = req.body;

    if (
      materialFabricCost === undefined ||
      tailoringCraftsmanshipCost === undefined ||
      embellishmentCost === undefined ||
      fittingCost === undefined ||
      !expectedCompletionDate
    ) {
      return res.status(400).json({ error: "Missing required itemized cost parameters." });
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        order: true,
        inquiry: {
          include: {
            customer: { select: { id: true, fullName: true, email: true } },
            designer: { select: { id: true, fullName: true, email: true, store: { select: { name: true } } } },
            piece: { select: { id: true, name: true, primaryImageUrl: true } },
            measurementProfile: true
          }
        }
      }
    });

    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found." });
    }

    if (quotation.order || quotation.status === "ACCEPTED") {
      return res.status(400).json({ error: "Accepted quotations cannot be edited or resent." });
    }

    const updatedQuotation = await prisma.$transaction(async (tx) => {
      const updated = await tx.quotation.update({
        where: { id },
        data: {
          materialFabricCost,
          tailoringCraftsmanshipCost,
          embellishmentCost,
          fittingCost,
          expectedCompletionDate: new Date(expectedCompletionDate),
          terms,
          depositNotes,
          status: "PENDING",
          rejectionReason: null
        },
        include: {
          order: true,
          inquiry: {
            include: {
              customer: { select: { id: true, fullName: true, email: true } },
              designer: { select: { id: true, fullName: true, email: true, store: { select: { name: true } } } },
              piece: { select: { id: true, name: true, primaryImageUrl: true } },
              measurementProfile: true
            }
          }
        }
      });

      await tx.quoteInquiry.update({
        where: { id: updated.inquiryId },
        data: { status: "QUOTED" }
      });

      return updated;
    });

    const totalQuoteAmount = quotationTotal(updatedQuotation);
    const designerName = updatedQuotation.inquiry.designer.store?.name || updatedQuotation.inquiry.designer.fullName || "Designer";
    const quoteUrl = `beviksmobile://designer/quote-acceptance?quotationId=${encodeURIComponent(updatedQuotation.id)}`;
    const notificationMessage = `${designerName} updated the quote for ${updatedQuotation.inquiry.piece.name}.`;

    invalidateResponseCache("quotations:");
    invalidateResponseCache("inquiries:");
    invalidateResponseCache(`closets:user:${updatedQuotation.inquiry.customerId}`);

    runInBackground("quotation.updated.notifications", async () => {
      await prisma.notification.create({
        data: {
          userId: updatedQuotation.inquiry.customerId,
          type: "ORDERS",
          title: "Quotation Updated",
          message: notificationMessage,
          amount: totalQuoteAmount,
          referenceId: updatedQuotation.id
        }
      });
      invalidateResponseCache(`notifications:user:${updatedQuotation.inquiry.customerId}`);
      await emitNotificationCreated(updatedQuotation.inquiry.customerId);

      await sendPushToUser(
        updatedQuotation.inquiry.customerId,
        "Quotation Updated",
        notificationMessage,
        { url: `/designer/quote-acceptance?quotationId=${updatedQuotation.id}`, type: "quotation", quotationId: updatedQuotation.id }
      );
      await sendQuotationEmail({
        to: updatedQuotation.inquiry.customer.email,
        userName: updatedQuotation.inquiry.customer.fullName,
        title: "Quotation Updated",
        bodyText: `${designerName} updated your quotation totaling ${totalQuoteAmount.toFixed(2)} for '${updatedQuotation.inquiry.piece.name}'. Review it in Beviks to accept, decline, or message the designer.`,
        buttonText: "VIEW QUOTATION",
        buttonUrl: quoteUrl,
      });
    });

    return res.status(200).json({
      message: "Quotation updated and resent successfully.",
      quotation: {
        ...updatedQuotation,
        materialFabricCost: Number(updatedQuotation.materialFabricCost),
        tailoringCraftsmanshipCost: Number(updatedQuotation.tailoringCraftsmanshipCost),
        embellishmentCost: Number(updatedQuotation.embellishmentCost),
        fittingCost: Number(updatedQuotation.fittingCost),
        totalQuoteAmount,
        depositAmount: totalQuoteAmount / 2
      }
    });
  } catch (error: any) {
    console.error("Update quotation error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/quotations/{id}/accept:
 *   post:
 *     summary: Accept Designer Quotation
 *     description: Customer accepts the quotation, transitioning the status to ACCEPTED and creating an active Order for the designer.
 *     tags:
 *       - Quotations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Quotation accepted and Order generated.
 */
quotationRouter.post("/quotations/:id/accept", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      select: {
        id: true,
        inquiryId: true,
        status: true,
        materialFabricCost: true,
        tailoringCraftsmanshipCost: true,
        embellishmentCost: true,
        fittingCost: true,
        depositNotes: true,
        order: true,
        inquiry: {
          select: {
            designerId: true,
            customerId: true,
          }
        }
      }
    });

    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found." });
    }

    if (quotation.status !== "PENDING") {
      return res.status(400).json({ error: `Quotation has already been ${quotation.status.toLowerCase()}.` });
    }

    // Use a transaction to ensure both statuses update and order is created
    const result = await prisma.$transaction(async (tx) => {
      const updatedQuotation = await tx.quotation.update({
        where: { id },
        data: { status: "ACCEPTED" },
      });

      await tx.quoteInquiry.update({
        where: { id: quotation.inquiryId },
        data: { status: "ACCEPTED" }
      });

      const totalQuoteCost = quotationTotal(quotation);

      const order = await tx.order.create({
        data: {
          quotationId: id,
          designerId: quotation.inquiry.designerId,
          customerId: quotation.inquiry.customerId,
          status: "QUOTING",
          progressPercentage: 0,
          timeline: {
            create: {
              title: "Quotation Approved",
              description: `Quotation totaling ${totalQuoteCost.toFixed(2)} accepted. Status set to QUOTING. Deposit notes: ${quotation.depositNotes || "None"}.`
            }
          }
        },
        include: {
          timeline: true
        }
      });

      return { quotation: updatedQuotation, order };
    });

    const totalQuoteCost = quotationTotal(quotation);
    const notificationMessage = `Customer has accepted your quote totaling ${totalQuoteCost.toFixed(2)}. An active order has been generated.`;

    invalidateResponseCache("quotations:");
    invalidateResponseCache("inquiries:");
    invalidateResponseCache("orders:");
    invalidateResponseCache(`closets:user:${quotation.inquiry.customerId}`);

    runInBackground("quotation.accepted.notifications", async () => {
      const notificationQuotation = await prisma.quotation.findUnique({
        where: { id },
        select: {
          inquiry: {
            select: {
              designerId: true,
              customer: { select: { fullName: true } },
              designer: { select: { email: true, fullName: true } },
              piece: { select: { name: true } }
            }
          }
        }
      });
      const notificationInquiry = notificationQuotation?.inquiry;
      if (!notificationInquiry) return;
      const customerName = notificationInquiry.customer?.fullName || "A Beviks client";

      await prisma.notification.create({
        data: {
          userId: notificationInquiry.designerId,
          type: "ORDERS",
          title: "Quotation Approved",
          message: notificationMessage,
          amount: totalQuoteCost,
          referenceId: result.order.id
        }
      });
      invalidateResponseCache(`notifications:user:${notificationInquiry.designerId}`);
      await emitNotificationCreated(notificationInquiry.designerId);

      await sendPushToUser(
        notificationInquiry.designerId,
        "Quotation Approved",
        `${customerName} accepted your quote totaling ${totalQuoteCost.toFixed(2)}.`,
        { url: `/designer/order-details?id=${result.order.id}`, type: "order", orderId: result.order.id }
      );

      await sendQuotationEmail({
        to: notificationInquiry.designer?.email,
        userName: notificationInquiry.designer?.fullName,
        title: "Quotation Approved",
        bodyText: `${customerName} accepted your quote totaling ${totalQuoteCost.toFixed(2)} for '${notificationInquiry.piece?.name || "their Beviks piece"}'. An active order has been created.`,
        buttonText: "VIEW ORDER",
        buttonUrl: `beviksmobile://designer/order-details?id=${result.order.id}`,
      });
    });

    return res.status(200).json({
      message: "Quotation accepted successfully. Active order generated.",
      quotation: result.quotation,
      order: result.order
    });
  } catch (error: any) {
    console.error("Accept quotation error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/quotations/{id}/reject:
 *   post:
 *     summary: Reject Designer Quotation
 *     description: Customer rejects the quotation, transitioning the status to REJECTED.
 *     tags:
 *       - Quotations
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Quotation rejected.
 */
quotationRouter.post("/quotations/:id/reject", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

    if (!reason) {
      return res.status(400).json({ error: "Decline reason is required." });
    }

    if (reason.length > 240) {
      return res.status(400).json({ error: "Decline reason must be 240 characters or less." });
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      select: {
        id: true,
        inquiryId: true,
        status: true,
        materialFabricCost: true,
        tailoringCraftsmanshipCost: true,
        embellishmentCost: true,
        fittingCost: true,
        inquiry: {
          select: {
            designerId: true,
            customerId: true,
          }
        }
      }
    });

    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found." });
    }

    if (quotation.status !== "PENDING") {
      return res.status(400).json({ error: `Quotation has already been ${quotation.status.toLowerCase()}.` });
    }

    const updatedQuotation = await prisma.$transaction(async (tx) => {
      const updated = await tx.quotation.update({
        where: { id },
        data: { status: "REJECTED", rejectionReason: reason }
      });

      await tx.quoteInquiry.update({
        where: { id: quotation.inquiryId },
        data: { status: "REJECTED" }
      });

      return updated;
    });

    const totalQuoteCost = quotationTotal(quotation);
    const reasonBrief = briefReason(reason, 100);
    const notificationMessage = `Customer rejected your quote totaling ${totalQuoteCost.toFixed(2)}. Reason: ${reasonBrief}`;

    invalidateResponseCache("quotations:");
    invalidateResponseCache("inquiries:");
    invalidateResponseCache(`closets:user:${quotation.inquiry.customerId}`);

    runInBackground("quotation.rejected.notifications", async () => {
      const notificationQuotation = await prisma.quotation.findUnique({
        where: { id },
        select: {
          inquiry: {
            select: {
              designerId: true,
              customer: { select: { fullName: true } },
              designer: { select: { email: true, fullName: true } },
              piece: { select: { name: true } }
            }
          }
        }
      });
      const notificationInquiry = notificationQuotation?.inquiry;
      if (!notificationInquiry) return;
      const customerName = notificationInquiry.customer?.fullName || "A Beviks client";

      await prisma.notification.create({
        data: {
          userId: notificationInquiry.designerId,
          type: "ORDERS",
          title: "Quotation Rejected",
          message: notificationMessage,
          amount: totalQuoteCost,
          referenceId: quotation.id
        }
      });
      invalidateResponseCache(`notifications:user:${notificationInquiry.designerId}`);
      await emitNotificationCreated(notificationInquiry.designerId);

      await sendPushToUser(
        notificationInquiry.designerId,
        "Quotation Rejected",
        `${customerName} declined your quote. Reason: ${reasonBrief}`,
        { url: `/designer/create-quote?quotationId=${quotation.id}`, type: "quotation", quotationId: quotation.id }
      );

      await sendQuotationEmail({
        to: notificationInquiry.designer?.email,
        userName: notificationInquiry.designer?.fullName,
        title: "Quotation Rejected",
        bodyText: `${customerName} declined your quote totaling ${totalQuoteCost.toFixed(2)} for '${notificationInquiry.piece?.name || "their Beviks piece"}'. Reason: ${reasonBrief}. You can edit and resend the quotation from Beviks.`,
        buttonText: "EDIT AND RESEND",
        buttonUrl: `beviksmobile://designer/create-quote?quotationId=${quotation.id}`,
      });
    });

    return res.status(200).json({
      message: "Quotation rejected successfully.",
      quotation: updatedQuotation
    });
  } catch (error: any) {
    console.error("Reject quotation error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
