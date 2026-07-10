import { Router, Request, Response } from "express";
import { prisma } from "../db.js";

export const pieceRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     PieceImageResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         pieceId:
 *           type: string
 *           format: uuid
 *         url:
 *           type: string
 *         order:
 *           type: integer
 *     PieceResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         storeId:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         price:
 *           type: number
 *         primaryImageUrl:
 *           type: string
 *         category:
 *           type: string
 *         heritage:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         images:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PieceImageResponse'
 */

/**
 * @openapi
 * /api/stores/{storeId}/pieces:
 *   post:
 *     summary: Add New Fashion Piece (Dress) to Store
 *     description: Creates a fashion piece (dress) with images, pricing, description, category, and cultural heritage filters.
 *     tags:
 *       - Pieces
 *     parameters:
 *       - in: path
 *         name: storeId
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
 *               - name
 *               - description
 *               - price
 *               - primaryImageUrl
 *               - category
 *               - heritage
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Yoruba Bridal Aso Oke Outfit"
 *               description:
 *                 type: string
 *                 example: "Elegant handwoven Aso Oke fabric custom styled for traditional engagements."
 *               price:
 *                 type: number
 *                 example: 750.00
 *               primaryImageUrl:
 *                 type: string
 *                 example: "https://cdn.beviks-api.com/uploads/aso-oke.jpg"
 *               category:
 *                 type: string
 *                 example: "Bridal Wear"
 *               heritage:
 *                 type: string
 *                 example: "Yoruba (Aso Oke / Iro & Buba)"
 *               otherImages:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["https://cdn.beviks-api.com/uploads/aso-oke-side.jpg"]
 *     responses:
 *       201:
 *         description: Piece successfully created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PieceResponse'
 *       400:
 *         description: Invalid parameters or store not found.
 */
pieceRouter.post("/stores/:storeId/pieces", async (req: Request, res: Response): Promise<any> => {
  try {
    const storeId = req.params.storeId as string;
    const { name, description, price, primaryImageUrl, category, heritage, otherImages } = req.body;

    if (!storeId || !name || !description || price === undefined || !primaryImageUrl || !category || !heritage) {
      return res.status(400).json({ error: "Missing required piece fields." });
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return res.status(404).json({ error: "Store not found." });
    }

    const piece = await prisma.piece.create({
      data: {
        storeId,
        name,
        description,
        price,
        primaryImageUrl,
        category,
        heritage,
        images: {
          create: otherImages ? otherImages.map((url: string, index: number) => ({
            url,
            order: index
          })) : []
        }
      },
      include: {
        images: true
      }
    });

    return res.status(201).json(piece);
  } catch (error: any) {
    console.error("Create piece error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/stores/{storeId}/pieces:
 *   get:
 *     summary: Retrieve All Pieces in a Store
 *     description: Lists all dresses/pieces registered under a given store.
 *     tags:
 *       - Pieces
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Store pieces array.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PieceResponse'
 */
pieceRouter.get("/stores/:storeId/pieces", async (req: Request, res: Response): Promise<any> => {
  try {
    const storeId = req.params.storeId as string;

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return res.status(404).json({ error: "Store not found." });
    }

    const pieces = await prisma.piece.findMany({
      where: { storeId },
      include: { images: { orderBy: { order: "asc" } } }
    });

    return res.status(200).json(pieces);
  } catch (error: any) {
    console.error("Get store pieces error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/pieces/{id}:
 *   put:
 *     summary: Edit Fashion Piece Details
 *     description: Updates name, description, price, images, category, and heritage for a specific piece.
 *     tags:
 *       - Pieces
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
 *               - name
 *               - description
 *               - price
 *               - primaryImageUrl
 *               - category
 *               - heritage
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               primaryImageUrl:
 *                 type: string
 *               category:
 *                 type: string
 *               heritage:
 *                 type: string
 *               otherImages:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Piece updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PieceResponse'
 *       404:
 *         description: Piece not found.
 */
pieceRouter.put("/pieces/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const { name, description, price, primaryImageUrl, category, heritage, otherImages } = req.body;

    if (!id || !name || !description || price === undefined || !primaryImageUrl || !category || !heritage) {
      return res.status(400).json({ error: "Missing required update fields." });
    }

    const piece = await prisma.piece.findUnique({ where: { id } });
    if (!piece) {
      return res.status(404).json({ error: "Piece not found." });
    }

    // Clean up secondary images first
    await prisma.pieceImage.deleteMany({ where: { pieceId: id } });

    const updatedPiece = await prisma.piece.update({
      where: { id },
      data: {
        name,
        description,
        price,
        primaryImageUrl,
        category,
        heritage,
        images: {
          create: otherImages ? otherImages.map((url: string, index: number) => ({
            url,
            order: index
          })) : []
        }
      },
      include: {
        images: true
      }
    });

    return res.status(200).json(updatedPiece);
  } catch (error: any) {
    console.error("Update piece error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/pieces/{id}:
 *   delete:
 *     summary: Delete Fashion Piece
 *     description: Permanently removes a fashion piece from the store database.
 *     tags:
 *       - Pieces
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Piece successfully deleted.
 *       404:
 *         description: Piece not found.
 */
pieceRouter.delete("/pieces/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const piece = await prisma.piece.findUnique({ where: { id } });
    if (!piece) {
      return res.status(404).json({ error: "Piece not found." });
    }

    await prisma.piece.delete({ where: { id } });

    return res.status(200).json({ message: "Piece successfully deleted." });
  } catch (error: any) {
    console.error("Delete piece error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
