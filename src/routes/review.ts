import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { emitNotificationCreated } from "../utils/realtime.js";
import { sendPushToUser } from "../utils/push.js";
import { runInBackground } from "../utils/asyncTasks.js";

export const reviewRouter = Router();

const emptyReviewSummary = {
  averageCommunication: 5,
  averageTimeliness: 5,
  averageQuality: 5,
  averageOverall: 5,
  totalReviews: 0
};

function buildReviewSummary(reviews: Array<{ communication: number; timeliness: number; quality: number; overall: number }>) {
  if (reviews.length === 0) return emptyReviewSummary;

  const totals = reviews.reduce(
    (acc, review) => ({
      communication: acc.communication + review.communication,
      timeliness: acc.timeliness + review.timeliness,
      quality: acc.quality + review.quality,
      overall: acc.overall + review.overall
    }),
    { communication: 0, timeliness: 0, quality: 0, overall: 0 }
  );

  return {
    averageCommunication: Number((totals.communication / reviews.length).toFixed(2)),
    averageTimeliness: Number((totals.timeliness / reviews.length).toFixed(2)),
    averageQuality: Number((totals.quality / reviews.length).toFixed(2)),
    averageOverall: Number((totals.overall / reviews.length).toFixed(2)),
    totalReviews: reviews.length
  };
}

/**
 * @openapi
 * components:
 *   schemas:
 *     ReviewResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         orderId:
 *           type: string
 *           format: uuid
 *         designerId:
 *           type: string
 *           format: uuid
 *         customerId:
 *           type: string
 *           format: uuid
 *         communication:
 *           type: integer
 *         timeliness:
 *           type: integer
 *         quality:
 *           type: integer
 *         overall:
 *           type: number
 *         description:
 *           type: string
 *           nullable: true
 *         images:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               url:
 *                 type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *     ReviewsSummaryResponse:
 *       type: object
 *       properties:
 *         summary:
 *           type: object
 *           properties:
 *             averageCommunication:
 *               type: number
 *             averageTimeliness:
 *               type: number
 *             averageQuality:
 *               type: number
 *             averageOverall:
 *               type: number
 *             totalReviews:
 *               type: integer
 *         reviews:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ReviewResponse'
 */

/**
 * @openapi
 * /api/orders/{orderId}/review:
 *   post:
 *     summary: Submit Rating and Review for Completed Order
 *     description: Customers leave ratings (communication, timeliness, quality), text review, and optional visual showcase images for a delivered order.
 *     tags:
 *       - Reviews
 *     parameters:
 *       - in: path
 *         name: orderId
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
 *               - communication
 *               - timeliness
 *               - quality
 *             properties:
 *               communication:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               timeliness:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 4
 *               quality:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               description:
 *                 type: string
 *                 example: "Absolutely stunning fit! Timely communication and great design inputs."
 *               imageUrls:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["https://cloudinary.com/showcase1.png"]
 *     responses:
 *       201:
 *         description: Review submitted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReviewResponse'
 *       400:
 *         description: Invalid scores or order is not completed.
 *       404:
 *         description: Order not found.
 */
reviewRouter.post("/orders/:orderId/review", async (req: Request, res: Response): Promise<any> => {
  try {
    const orderId = req.params.orderId as string;
    const { communication, timeliness, quality, rating, description, comment, imageUrls } = req.body;

    if (communication === undefined && timeliness === undefined && quality === undefined && rating === undefined) {
      return res.status(400).json({ error: "communication, timeliness, and quality ratings are required." });
    }

    const fallbackScore = Number(rating);
    const commScore = Number(communication ?? fallbackScore);
    const timeScore = Number(timeliness ?? fallbackScore);
    const qualScore = Number(quality ?? fallbackScore);

    if ([commScore, timeScore, qualScore].some(s => s < 1 || s > 5)) {
      return res.status(400).json({ error: "Rating scores must be integers between 1 and 5." });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { review: true }
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (order.status !== "DELIVERY") {
      return res.status(400).json({ error: "Reviews can only be submitted for completed orders (status: DELIVERY)." });
    }

    if (order.review) {
      return res.status(400).json({ error: "This order has already been reviewed." });
    }

    const overall = (commScore + timeScore + qualScore) / 3;

    const result = await prisma.$transaction(async (tx) => {
      // Create Review
      const review = await tx.review.create({
        data: {
          orderId,
          designerId: order.designerId,
          customerId: order.customerId,
          communication: commScore,
          timeliness: timeScore,
          quality: qualScore,
          overall,
          description: description || comment,
          images: imageUrls && imageUrls.length > 0 ? {
            create: imageUrls.map((url: string) => ({ url }))
          } : undefined
        },
        include: {
          images: true
        }
      });

      // Update Order timeline logs
      await tx.orderTimeline.create({
        data: {
          orderId,
          title: "Review Submitted",
          description: `Customer submitted feedback. Overall Rating: ${overall.toFixed(1)}/5.0 stars.`
        }
      });

      // Spawn Designer notification
      await tx.notification.create({
        data: {
          userId: order.designerId,
          type: "SOCIALS",
          title: "New Review Received",
          message: `Customer has left a ${overall.toFixed(1)}-star review for order ID ${orderId.slice(0, 8)}.`,
          referenceId: orderId
        }
      });

      return review;
    });

    await emitNotificationCreated(order.designerId);
    runInBackground("review.created.push", async () => {
      await sendPushToUser(
        order.designerId,
        "New Review Received",
        `Customer has left a ${result.overall.toFixed(1)}-star review for order ID ${orderId.slice(0, 8)}.`,
        {
          url: `/designer/order-details?id=${orderId}`,
          type: "review",
          orderId,
        }
      );
    });

    return res.status(201).json(result);
  } catch (error: any) {
    console.error("Create review error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

reviewRouter.get("/pieces/:pieceId/reviews", async (req: Request, res: Response): Promise<any> => {
  try {
    const pieceId = req.params.pieceId as string;

    const piece = await prisma.piece.findUnique({ where: { id: pieceId } });
    if (!piece) {
      return res.status(404).json({ error: "Piece not found." });
    }

    const reviews = await prisma.review.findMany({
      where: {
        order: {
          quotation: {
            inquiry: { pieceId }
          }
        }
      },
      include: {
        customer: { select: { id: true, fullName: true, profileImageUrl: true } },
        images: true
      },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json({
      summary: buildReviewSummary(reviews),
      reviews
    });
  } catch (error: any) {
    console.error("Get piece reviews error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

reviewRouter.get("/collections/:collectionId/reviews", async (req: Request, res: Response): Promise<any> => {
  try {
    const collectionId = req.params.collectionId as string;

    const collection = await prisma.collection.findUnique({
      where: { id: collectionId },
      include: { pieces: { select: { pieceId: true } } }
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
      include: {
        customer: { select: { id: true, fullName: true, profileImageUrl: true } },
        images: true
      },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json({
      summary: buildReviewSummary(reviews),
      reviews
    });
  } catch (error: any) {
    console.error("Get collection reviews error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/designers/{designerId}/reviews:
 *   get:
 *     summary: Retrieve Designer Reviews and Rating Summaries
 *     description: Calculates average scores in communication, timeliness, and quality, and returns the full list of reviews left by customers.
 *     tags:
 *       - Reviews
 *     parameters:
 *       - in: path
 *         name: designerId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Designer reviews list with summary metrics.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReviewsSummaryResponse'
 */
reviewRouter.get("/designers/:designerId/reviews", async (req: Request, res: Response): Promise<any> => {
  try {
    const designerId = req.params.designerId as string;

    const designer = await prisma.user.findUnique({ where: { id: designerId } });
    if (!designer) {
      return res.status(404).json({ error: "Designer account not found." });
    }

    const reviews = await prisma.review.findMany({
      where: { designerId },
      include: {
        customer: { select: { id: true, fullName: true, profileImageUrl: true } },
        images: true
      },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json({
      summary: buildReviewSummary(reviews),
      reviews
    });
  } catch (error: any) {
    console.error("Get designer reviews error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
