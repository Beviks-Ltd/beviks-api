import { Router, Request, Response } from "express";
import { prisma } from "../db.js";

export const quotationRouter = Router();

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
      include: { quotation: true }
    });

    if (!inquiry) {
      return res.status(404).json({ error: "Inquiry not found." });
    }

    if (inquiry.quotation) {
      return res.status(400).json({ error: "A quotation has already been submitted for this inquiry." });
    }

    const quotation = await prisma.quotation.create({
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

    return res.status(201).json(quotation);
  } catch (error: any) {
    console.error("Create quotation error:", error);
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
      include: { inquiry: true, order: true }
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
        include: { inquiry: true }
      });

      await tx.quoteInquiry.update({
        where: { id: quotation.inquiryId },
        data: { status: "ACCEPTED" }
      });

      const order = await tx.order.create({
        data: {
          quotationId: id,
          designerId: quotation.inquiry.designerId,
          customerId: quotation.inquiry.customerId,
          status: "CONFIRMED"
        }
      });

      return { quotation: updatedQuotation, order };
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

    const quotation = await prisma.quotation.findUnique({
      where: { id }
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
        data: { status: "REJECTED" }
      });

      await tx.quoteInquiry.update({
        where: { id: quotation.inquiryId },
        data: { status: "REJECTED" }
      });

      return updated;
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
