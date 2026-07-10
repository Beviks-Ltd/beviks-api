import { Router, Request, Response } from "express";
import { prisma } from "../db.js";

export const storeRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     StoreStatus:
 *       type: string
 *       enum: [PENDING_VERIFICATION, VERIFIED, PRIVATE]
 *     StoreResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         designerId:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         logoUrl:
 *           type: string
 *         coverUrl:
 *           type: string
 *         status:
 *           $ref: '#/components/schemas/StoreStatus'
 *         views:
 *           type: integer
 *         salesCount:
 *           type: integer
 *         piecesCount:
 *           type: integer
 *         collectionsCount:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @openapi
 * /api/stores:
 *   post:
 *     summary: Create Designer Storefront
 *     description: Creates a storefront for a designer. Can be accessed even if the designer's email is not yet verified (returns user status to show frontend warnings).
 *     tags:
 *       - Stores
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - designerId
 *               - name
 *               - description
 *               - logoUrl
 *               - coverUrl
 *             properties:
 *               designerId:
 *                 type: string
 *                 format: uuid
 *                 example: e634127c-9b76-47ee-8cd6-c67ee59d9972
 *               name:
 *                 type: string
 *                 example: "Avenue Designs"
 *               description:
 *                 type: string
 *                 example: "High quality bespoke garments and accessories."
 *               logoUrl:
 *                 type: string
 *                 example: "https://cdn.beviks-api.com/uploads/logo.png"
 *               coverUrl:
 *                 type: string
 *                 example: "https://cdn.beviks-api.com/uploads/cover.png"
 *     responses:
 *       201:
 *         description: Storefront initialized.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 store:
 *                   $ref: '#/components/schemas/StoreResponse'
 *                 isEmailVerified:
 *                   type: boolean
 *                   description: Status to indicate if the user should see an unverified banner.
 *                 isIdentityVerified:
 *                   type: boolean
 *                   description: Status to indicate if the designer's credentials are verified.
 *       400:
 *         description: User is not a designer or already has a store.
 */
storeRouter.post("/", async (req: Request, res: Response): Promise<any> => {
  try {
    const { designerId, name, description, logoUrl, coverUrl } = req.body;

    if (!designerId || !name || !description || !logoUrl || !coverUrl) {
      return res.status(400).json({ error: "Missing required storefront parameters." });
    }

    const designer = await prisma.user.findUnique({
      where: { id: designerId },
      include: { designerProfile: true }
    });

    if (!designer) {
      return res.status(404).json({ error: "Designer user account not found." });
    }

    if (designer.role !== "DESIGNER") {
      return res.status(400).json({ error: "Only accounts registered as DESIGNER can create a storefront." });
    }

    // Check if store already exists
    const existingStore = await prisma.store.findUnique({ where: { designerId } });
    if (existingStore) {
      return res.status(400).json({ error: "Designer already has a storefront initialized." });
    }

    // Create store (set status to PENDING_VERIFICATION and private by default)
    const store = await prisma.store.create({
      data: {
        designerId,
        name,
        description,
        logoUrl,
        coverUrl,
        status: "PENDING_VERIFICATION"
      }
    });

    return res.status(201).json({
      message: "Storefront created and submitted for manual verification. It will remain private until approved.",
      store,
      isEmailVerified: designer.isEmailVerified,
      isIdentityVerified: designer.designerProfile?.isIdentityVerified || false
    });
  } catch (error: any) {
    console.error("Store creation error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/stores/my-store:
 *   get:
 *     summary: Retrieve Designer's Own Storefront
 *     description: Fetches storefront config details belonging to the designer.
 *     tags:
 *       - Stores
 *     parameters:
 *       - in: query
 *         name: designerId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The designer's user ID.
 *     responses:
 *       200:
 *         description: Store details retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StoreResponse'
 *       404:
 *         description: Store not found.
 */
storeRouter.get("/my-store", async (req: Request, res: Response): Promise<any> => {
  try {
    const { designerId } = req.query;

    if (!designerId || typeof designerId !== "string") {
      return res.status(400).json({ error: "designerId query parameter is required." });
    }

    const store = await prisma.store.findUnique({
      where: { designerId },
      include: {
        _count: {
          select: { pieces: true, collections: true }
        }
      }
    });
    if (!store) {
      return res.status(404).json({ error: "Store not found for this designer." });
    }

    return res.status(200).json({
      ...store,
      piecesCount: store._count.pieces,
      collectionsCount: store._count.collections
    });
  } catch (error: any) {
    console.error("Get my store error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/stores/my-store:
 *   put:
 *     summary: Update Designer Storefront
 *     description: Allows the designer to edit details of their store (name, description, logo, cover). The store will remain private/pending verification.
 *     tags:
 *       - Stores
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - designerId
 *               - name
 *               - description
 *               - logoUrl
 *               - coverUrl
 *             properties:
 *               designerId:
 *                 type: string
 *                 format: uuid
 *                 example: e634127c-9b76-47ee-8cd6-c67ee59d9972
 *               name:
 *                 type: string
 *                 example: "Avenue Designs New Name"
 *               description:
 *                 type: string
 *                 example: "Updated description..."
 *               logoUrl:
 *                 type: string
 *                 example: "https://cdn.beviks-api.com/uploads/logo.png"
 *               coverUrl:
 *                 type: string
 *                 example: "https://cdn.beviks-api.com/uploads/cover.png"
 *     responses:
 *       200:
 *         description: Store updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StoreResponse'
 *       404:
 *         description: Store not found.
 */
storeRouter.put("/my-store", async (req: Request, res: Response): Promise<any> => {
  try {
    const { designerId, name, description, logoUrl, coverUrl } = req.body;

    if (!designerId || !name || !description || !logoUrl || !coverUrl) {
      return res.status(400).json({ error: "Missing storefront update parameters." });
    }

    const store = await prisma.store.findUnique({ where: { designerId } });
    if (!store) {
      return res.status(404).json({ error: "Store not found for this designer." });
    }

    const updatedStore = await prisma.store.update({
      where: { designerId },
      data: {
        name,
        description,
        logoUrl,
        coverUrl
      }
    });

    return res.status(200).json({
      message: "Storefront updated successfully.",
      store: updatedStore
    });
  } catch (error: any) {
    console.error("Update store error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/stores/{id}:
 *   get:
 *     summary: View Public Storefront
 *     description: Fetches a storefront by its public ID. Access is blocked if the storefront is private or pending verification (unless requested by the owner).
 *     tags:
 *       - Stores
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The Store ID.
 *       - in: query
 *         name: viewerId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID of the person viewing (to allow owner overrides on private storefronts).
 *     responses:
 *       200:
 *         description: Public store details.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StoreResponse'
 *       403:
 *         description: Access denied because the store is private/unverified.
 *       404:
 *         description: Store not found.
 */
storeRouter.get("/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const viewerId = req.query.viewerId as string | undefined;

    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) {
      return res.status(404).json({ error: "Store not found." });
    }

    // Block non-owner access if store is not verified/public
    if (store.status !== "VERIFIED" && store.designerId !== viewerId) {
      return res.status(403).json({
        error: "Access Denied. This storefront is currently private and undergoing manual validation.",
        status: store.status
      });
    }

    // Increment views if seen by a visitor
    let finalViews = store.views;
    if (store.designerId !== viewerId) {
      const updatedStore = await prisma.store.update({
        where: { id },
        data: { views: { increment: 1 } }
      });
      finalViews = updatedStore.views;
    }

    // Get pieces and collections count
    const stats = await prisma.store.findUnique({
      where: { id },
      include: {
        _count: {
          select: { pieces: true, collections: true }
        }
      }
    });

    return res.status(200).json({
      ...store,
      views: finalViews,
      piecesCount: stats?._count.pieces || 0,
      collectionsCount: stats?._count.collections || 0
    });
  } catch (error: any) {
    console.error("Get public store error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
