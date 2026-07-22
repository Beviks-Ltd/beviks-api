import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { invalidateResponseCache } from "../utils/responseCache.js";

export const collectionRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     CollectionResponse:
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
 *         story:
 *           type: string
 *         imageUrl:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         pieces:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               pieceId:
 *                 type: string
 *                 format: uuid
 *               piece:
 *                 $ref: '#/components/schemas/PieceResponse'
 */

/**
 * @openapi
 * /api/stores/{storeId}/collections:
 *   post:
 *     summary: Create Storefront Collection
 *     description: Creates a new collection featuring a name, story, a visual anchor (image), and links chosen dresses/pieces.
 *     tags:
 *       - Collections
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
 *               - story
 *               - imageUrl
 *               - pieceIds
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Yoruba Royalty Collection"
 *               story:
 *                 type: string
 *                 example: "A collection inspired by the rich ceremonial fabrics and history of Yoruba kings."
 *               imageUrl:
 *                 type: string
 *                 example: "https://cdn.beviks-api.com/uploads/collection-cover.jpg"
 *               pieceIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["piece-uuid-1", "piece-uuid-2"]
 *     responses:
 *       201:
 *         description: Collection successfully created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CollectionResponse'
 *       400:
 *         description: Invalid parameters or store not found.
 */
collectionRouter.post("/stores/:storeId/collections", async (req: Request, res: Response): Promise<any> => {
  try {
    const storeId = req.params.storeId as string;
    const { name, story, imageUrl, pieceIds } = req.body;

    if (!storeId || !name || !story || !imageUrl || !pieceIds || !Array.isArray(pieceIds)) {
      return res.status(400).json({ error: "Missing required collection parameters." });
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return res.status(404).json({ error: "Store not found." });
    }

    const collection = await prisma.collection.create({
      data: {
        storeId,
        name,
        story,
        imageUrl,
        pieces: {
          create: pieceIds.map((pieceId: string) => ({
            pieceId
          }))
        }
      },
      include: {
        pieces: {
          include: { piece: { include: { images: true } } }
        }
      }
    });

    return res.status(201).json(collection);
  } catch (error: any) {
    console.error("Create collection error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/stores/{storeId}/collections:
 *   get:
 *     summary: Retrieve Storefront Collections
 *     description: Lists all collections belonging to a store, including their nested pieces.
 *     tags:
 *       - Collections
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Array of storefront collections.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CollectionResponse'
 */
collectionRouter.get("/stores/:storeId/collections", async (req: Request, res: Response): Promise<any> => {
  try {
    const storeId = req.params.storeId as string;

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return res.status(404).json({ error: "Store not found." });
    }

    const collections = await prisma.collection.findMany({
      where: { storeId },
      include: {
        pieces: {
          include: { piece: { include: { images: true } } }
        }
      }
    });

    return res.status(200).json(collections);
  } catch (error: any) {
    console.error("Get store collections error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

collectionRouter.get("/collections", async (req: Request, res: Response): Promise<any> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 12, 30);
    const collections = await prisma.collection.findMany({
      include: {
        store: {
          select: {
            id: true,
            designerId: true,
            name: true,
            logoUrl: true,
          }
        },
        pieces: {
          include: {
            piece: {
              include: {
                images: { orderBy: { order: "asc" } }
              }
            }
          }
        }
      },
      orderBy: [
        { views: "desc" },
        { updatedAt: "desc" }
      ],
      take: limit,
    });

    return res.status(200).json(collections);
  } catch (error: any) {
    console.error("Get featured collections error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/collections/{id}:
 *   get:
 *     summary: Get Single Collection Detail
 *     description: Fetches story and links details for a specific collection.
 *     tags:
 *       - Collections
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Collection details.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CollectionResponse'
 *       404:
 *         description: Collection not found.
 */
collectionRouter.get("/collections/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const collection = await prisma.collection.findUnique({
      where: { id },
      include: {
        store: {
          select: {
            id: true,
            designerId: true,
            name: true,
            logoUrl: true,
            coverUrl: true
          }
        },
        pieces: {
          include: { piece: { include: { images: true } } }
        }
      }
    });

    if (!collection) {
      return res.status(404).json({ error: "Collection not found." });
    }

    const pieceIds = collection.pieces.map((item) => item.pieceId);
    const reviews = pieceIds.length === 0 ? [] : await prisma.review.findMany({
      where: {
        order: {
          quotation: {
            inquiry: { pieceId: { in: pieceIds } }
          }
        }
      },
      select: { overall: true }
    });
    const averageOverall = reviews.length === 0
      ? 5
      : Number((reviews.reduce((sum, review) => sum + review.overall, 0) / reviews.length).toFixed(2));

    return res.status(200).json({
      ...collection,
      reviewsSummary: {
        averageOverall,
        totalReviews: reviews.length
      }
    });
  } catch (error: any) {
    console.error("Get collection error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

collectionRouter.post("/collections/:id/view", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const collection = await prisma.collection.update({
      where: { id },
      data: { views: { increment: 1 } },
      select: {
        id: true,
        views: true,
        store: { select: { designerId: true } }
      }
    });

    invalidateResponseCache(`stores:designer:${collection.store.designerId}`);
    return res.status(200).json({ id: collection.id, views: collection.views });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return res.status(404).json({ error: "Collection not found." });
    }
    console.error("Track collection view error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/collections/{id}:
 *   put:
 *     summary: Update Storefront Collection Details
 *     description: Modifies name, story, visual anchor cover photo, and updates linked pieces (associating/unassociating pieceIds).
 *     tags:
 *       - Collections
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
 *               - story
 *               - imageUrl
 *               - pieceIds
 *             properties:
 *               name:
 *                 type: string
 *               story:
 *                 type: string
 *               imageUrl:
 *                 type: string
 *               pieceIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Collection updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CollectionResponse'
 *       404:
 *         description: Collection not found.
 */
collectionRouter.put("/collections/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const { name, story, imageUrl, pieceIds } = req.body;

    if (!id || !name || !story || !imageUrl || !pieceIds || !Array.isArray(pieceIds)) {
      return res.status(400).json({ error: "Missing required collection update fields." });
    }

    const collection = await prisma.collection.findUnique({ where: { id } });
    if (!collection) {
      return res.status(404).json({ error: "Collection not found." });
    }

    // Clean up existing linked pieces
    await prisma.collectionPiece.deleteMany({ where: { collectionId: id } });

    const updatedCollection = await prisma.collection.update({
      where: { id },
      data: {
        name,
        story,
        imageUrl,
        pieces: {
          create: pieceIds.map((pieceId: string) => ({
            pieceId
          }))
        }
      },
      include: {
        pieces: {
          include: { piece: { include: { images: true } } }
        }
      }
    });

    return res.status(200).json(updatedCollection);
  } catch (error: any) {
    console.error("Update collection error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/collections/{id}:
 *   delete:
 *     summary: Delete Storefront Collection
 *     description: Permanently removes a collection. Linked pieces will remain intact in the main database.
 *     tags:
 *       - Collections
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Collection deleted successfully.
 *       404:
 *         description: Collection not found.
 */
collectionRouter.delete("/collections/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const designerId = (req.query.designerId as string | undefined) || req.body?.designerId;

    if (!designerId) {
      return res.status(400).json({ error: "designerId is required to delete a collection." });
    }

    const collection = await prisma.collection.findUnique({
      where: { id },
      include: { store: { select: { designerId: true } } }
    });
    if (!collection) {
      return res.status(404).json({ error: "Collection not found." });
    }
    if (collection.store.designerId !== designerId) {
      return res.status(403).json({ error: "Only the store owner can delete this collection." });
    }

    await prisma.collection.delete({ where: { id } });

    return res.status(200).json({ message: "Collection successfully deleted." });
  } catch (error: any) {
    console.error("Delete collection error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

collectionRouter.post("/collections/:id/report", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const { userId, reason, details } = req.body;

    if (!userId || !reason) {
      return res.status(400).json({ error: "userId and reason are required." });
    }

    const [collection, user] = await Promise.all([
      prisma.collection.findUnique({ where: { id } }),
      prisma.user.findUnique({ where: { id: userId } })
    ]);

    if (!collection) {
      return res.status(404).json({ error: "Collection not found." });
    }
    if (!user) {
      return res.status(404).json({ error: "User profile not found." });
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber: `RPT-${Date.now().toString(36).toUpperCase()}`,
        userId,
        subject: `Reported collection: ${collection.name}`,
        category: "REPORT_COLLECTION",
        status: "OPEN",
        lastMessage: `${reason}${details ? ` - ${details}` : ""}`,
        messages: {
          create: {
            senderId: userId,
            senderName: user.fullName,
            senderRole: "USER",
            content: `Collection ID: ${id}\nStore ID: ${collection.storeId}\nReason: ${reason}${details ? `\nDetails: ${details}` : ""}`
          }
        }
      }
    });

    return res.status(201).json({ message: "Collection report submitted.", ticket });
  } catch (error: any) {
    console.error("Report collection error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
