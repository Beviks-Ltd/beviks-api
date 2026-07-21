import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { invalidateResponseCache, sendCachedJson, uncachedJson } from "../utils/responseCache.js";

export const inquiryRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     InspirationImageResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         quoteInquiryId:
 *           type: string
 *           format: uuid
 *         url:
 *           type: string
 *     QuoteInquiryResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         pieceId:
 *           type: string
 *           format: uuid
 *         designerId:
 *           type: string
 *           format: uuid
 *         customerId:
 *           type: string
 *           format: uuid
 *         measurementProfileId:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         specialInstructions:
 *           type: string
 *           nullable: true
 *         budget:
 *           type: number
 *         colorPalette:
 *           type: array
 *           items:
 *             type: string
 *         material:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         inspirations:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/InspirationImageResponse'
 *         customer:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             fullName:
 *               type: string
 *             profileImageUrl:
 *               type: string
 *               nullable: true
 *         piece:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *             primaryImageUrl:
 *               type: string
 *         measurementProfile:
 *           $ref: '#/components/schemas/MeasurementProfileResponse'
 */

/**
 * @openapi
 * /api/inquiries:
 *   post:
 *     summary: Submit Quote Request for Dress Piece
 *     description: Submits a comprehensive dress quote request containing budget, color palettes, preferred materials, instructions, selected measurement profile, and multiple inspiration images.
 *     tags:
 *       - Inquiries
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pieceId
 *               - customerId
 *               - budget
 *             properties:
 *               pieceId:
 *                 type: string
 *                 format: uuid
 *                 example: e634127c-9b76-47ee-8cd6-c67ee59d9972
 *               customerId:
 *                 type: string
 *                 format: uuid
 *                 example: a5941a7c-9b76-47ee-8cd6-c67ee59d9972
 *               measurementProfileId:
 *                 type: string
 *                 format: uuid
 *                 example: b7741b7c-9b76-47ee-8cd6-c67ee59d9972
 *               specialInstructions:
 *                 type: string
 *                 example: "Please use double gold lace lining on the hem."
 *               budget:
 *                 type: number
 *                 example: 950.00
 *               colorPalette:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["#FFD700", "#FFFFFF"]
 *               material:
 *                 type: string
 *                 example: "Silk & Heavy Lace"
 *               inspirationImages:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["https://cdn.beviks-api.com/uploads/inspiration1.jpg"]
 *     responses:
 *       201:
 *         description: Inquiry submitted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QuoteInquiryResponse'
 *       400:
 *         description: Missing fields or invalid associations.
 */
inquiryRouter.post("/inquiries", async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      pieceId,
      designerId,
      pieceName,
      pieceImageUrl,
      customerId,
      measurementProfileId,
      specialInstructions,
      budget,
      colorPalette,
      material,
      inspirationImages
    } = req.body;

    if ((!pieceId && !designerId) || !customerId || budget === undefined) {
      return res.status(400).json({ error: "pieceId or designerId, customerId, and budget are required parameters." });
    }

    let piece = pieceId
      ? await prisma.piece.findUnique({
          where: { id: pieceId },
          include: { store: true }
        })
      : null;

    if (!piece && designerId) {
      const store = await prisma.store.findUnique({ where: { designerId } });
      if (!store) {
        return res.status(404).json({ error: "Designer store not found." });
      }

      piece = await prisma.piece.create({
        data: {
          storeId: store.id,
          name: pieceName || "Custom Beviks Request",
          description: specialInstructions || "Custom quote request from a client.",
          price: budget,
          primaryImageUrl: pieceImageUrl || "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600&auto=format&fit=crop&q=80",
          category: "CUSTOM",
          heritage: "Custom",
          status: "DRAFT"
        },
        include: { store: true }
      });
    }

    if (!piece) {
      return res.status(404).json({ error: "Piece not found." });
    }

    const customer = await prisma.user.findUnique({ where: { id: customerId } });
    if (!customer) {
      return res.status(404).json({ error: "Customer account not found." });
    }

    if (measurementProfileId) {
      const profile = await prisma.measurementProfile.findUnique({ where: { id: measurementProfileId } });
      if (!profile) {
        return res.status(404).json({ error: "Measurement profile not found." });
      }
    }

    const inquiry = await prisma.quoteInquiry.create({
      data: {
        pieceId: piece.id,
        designerId: piece.store.designerId,
        customerId,
        measurementProfileId: measurementProfileId || null,
        specialInstructions,
        budget,
        colorPalette: colorPalette || [],
        material,
        inspirations: {
          create: inspirationImages ? inspirationImages.map((url: string) => ({
            url
          })) : []
        }
      },
      include: {
        inspirations: true,
        customer: { select: { id: true, fullName: true, profileImageUrl: true } },
        piece: { select: { id: true, name: true, primaryImageUrl: true } }
      }
    });

    invalidateResponseCache("inquiries:");

    return res.status(201).json(inquiry);
  } catch (error: any) {
    console.error("Create inquiry error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/designers/{designerId}/inquiries:
 *   get:
 *     summary: Retrieve Designer's Incoming Pending Inquiries
 *     description: Lists all pending dress quote inquiries for a designer. Returns key customer data (name, avatar image), piece title, budget, color palettes, and inspiration items.
 *     tags:
 *       - Inquiries
 *     parameters:
 *       - in: path
 *         name: designerId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of pending inquiries.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/QuoteInquiryResponse'
 */
inquiryRouter.get("/designers/:designerId/inquiries", async (req: Request, res: Response): Promise<any> => {
  try {
    const designerId = req.params.designerId as string;

    return sendCachedJson(req, res, `inquiries:designer:${designerId}:pending`, 8000, async () => {
      return prisma.quoteInquiry.findMany({
        where: { designerId, status: "PENDING" },
        include: {
          customer: { select: { id: true, fullName: true, profileImageUrl: true } },
          piece: { select: { id: true, name: true, primaryImageUrl: true } },
          inspirations: true,
          measurementProfile: true
        },
        orderBy: { createdAt: "desc" }
      });
    });
  } catch (error: any) {
    console.error("Get designer inquiries error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/inquiries/{id}:
 *   get:
 *     summary: Retrieve Quote Inquiry Detailed Specifications
 *     description: Fetches full specs for a specific inquiry, including budget details, inspirations, and complete customer measurement parameters.
 *     tags:
 *       - Inquiries
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Inquiry details retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QuoteInquiryResponse'
 *       404:
 *         description: Inquiry not found.
 */
inquiryRouter.get("/inquiries/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    return sendCachedJson(req, res, `inquiries:detail:${id}`, 8000, async () => {
      const inquiry = await prisma.quoteInquiry.findUnique({
        where: { id },
        include: {
          customer: { select: { id: true, fullName: true, profileImageUrl: true } },
          piece: { select: { id: true, name: true, primaryImageUrl: true } },
          inspirations: true,
          measurementProfile: true
        }
      });

      if (!inquiry) {
        return uncachedJson(404, { error: "Inquiry not found." });
      }

      return inquiry;
    });
  } catch (error: any) {
    console.error("Get inquiry details error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

inquiryRouter.delete("/inquiries/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const designerId = (req.query.designerId as string | undefined) || req.body?.designerId;

    if (!designerId) {
      return res.status(400).json({ error: "designerId is required to delete an inquiry." });
    }

    const inquiry = await prisma.quoteInquiry.findUnique({
      where: { id },
      include: { quotation: true }
    });

    if (!inquiry) {
      return res.status(404).json({ error: "Inquiry not found." });
    }

    if (inquiry.designerId !== designerId) {
      return res.status(403).json({ error: "Only the receiving designer can delete this inquiry." });
    }

    if (inquiry.quotation) {
      return res.status(400).json({ error: "Quoted inquiries cannot be deleted. Manage the quotation instead." });
    }

    await prisma.quoteInquiry.delete({ where: { id } });

    invalidateResponseCache("inquiries:");

    return res.status(200).json({ message: "Inquiry deleted successfully." });
  } catch (error: any) {
    console.error("Delete inquiry error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
