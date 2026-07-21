import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { cache } from "../utils/cache.js";
import { sendPushToUser } from "../utils/push.js";

export const storePostRouter = Router();

const APP_DEEP_LINK_SCHEME = process.env.APP_DEEP_LINK_SCHEME || "beviksmobile";
const COMMENT_CONTENT_LIMIT = 280;

function canPostRequestQuote(post: { quoteEnabled?: boolean | null; isClientRequest?: boolean | null; quoteInquiryId?: string | null }) {
  return Boolean(post.quoteEnabled || post.isClientRequest || post.quoteInquiryId);
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getPublicBaseUrl(req: Request) {
  const configuredBaseUrl = process.env.PUBLIC_BASE_URL || process.env.API_PUBLIC_URL || process.env.BEVIKS_PUBLIC_URL;
  if (configuredBaseUrl) return trimTrailingSlash(configuredBaseUrl);

  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto?.split(",")[0]?.trim() || req.protocol || "http";

  return `${protocol}://${req.get("host")}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function getPostSharePayload(req: Request, id: string) {
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      media: { orderBy: { order: "asc" } },
      designer: {
        select: {
          fullName: true
        }
      }
    }
  });

  if (!post) return null;

  const caption = post.caption?.trim();
  const title = caption || `${post.designer?.fullName || "Beviks"} post`;
  const description = post.designer?.fullName
    ? `A Beviks post by ${post.designer.fullName}.`
    : "Open this Beviks post in the app.";
  const baseUrl = getPublicBaseUrl(req);
  const shareUrl = `${baseUrl}/api/posts/${encodeURIComponent(id)}/preview`;
  const deepLink = `${APP_DEEP_LINK_SCHEME}://explore/post-details?id=${encodeURIComponent(id)}`;
  const imageUrl = post.media.find((item) => item.type === "IMAGE")?.url || post.media[0]?.url || "";

  return { title, description, shareUrl, deepLink, imageUrl };
}

/**
 * @openapi
 * components:
 *   schemas:
 *     MediaType:
 *       type: string
 *       enum: [IMAGE, VIDEO]
 *     PostMediaInput:
 *       type: object
 *       required:
 *         - url
 *         - type
 *       properties:
 *         url:
 *           type: string
 *           example: "https://cdn.beviks-api.com/uploads/dress.jpg"
 *         type:
 *           $ref: '#/components/schemas/MediaType'
 *         order:
 *           type: integer
 *           default: 0
 *     PostMediaResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         postId:
 *           type: string
 *           format: uuid
 *         url:
 *           type: string
 *         type:
 *           $ref: '#/components/schemas/MediaType'
 *         order:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *     PostResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         designerId:
 *           type: string
 *           format: uuid
 *         caption:
 *           type: string
 *           nullable: true
 *         quoteEnabled:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         media:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PostMediaResponse'
 *         likesCount:
 *           type: integer
 *         commentsCount:
 *           type: integer
 *         isLiked:
 *           type: boolean
 *         designer:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             fullName:
 *               type: string
 *             email:
 *               type: string
 *     CommentResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         content:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         likeCount:
 *           type: integer
 *         user:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             fullName:
 *               type: string
 *         replies:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CommentResponse'
 */

/**
 * @openapi
 * /api/posts:
 *   post:
 *     summary: Create New Post (Designer only)
 *     description: Publishes a post with media photos/videos, an optional caption, and optional client quote requests.
 *     tags:
 *       - Posts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - designerId
 *               - media
 *             properties:
 *               designerId:
 *                 type: string
 *                 format: uuid
 *                 example: e634127c-9b76-47ee-8cd6-c67ee59d9972
 *               caption:
 *                 type: string
 *                 example: "Check out this custom bridal dress!"
 *               quoteEnabled:
 *                 type: boolean
 *                 default: false
 *                 example: true
 *               media:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/PostMediaInput'
 *     responses:
 *       201:
 *         description: Post successfully created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PostResponse'
 *       400:
 *         description: Invalid role or missing fields.
 */
storePostRouter.post("/", async (req: Request, res: Response): Promise<any> => {
  try {
    const { designerId, caption, media, quoteEnabled, isClientRequest, budget } = req.body;

    if (!designerId || !media || !Array.isArray(media) || media.length === 0) {
      return res.status(400).json({ error: "designerId and at least one media item are required." });
    }

    const creator = await prisma.user.findUnique({ where: { id: designerId } });
    if (!creator) {
      return res.status(404).json({ error: "User account not found." });
    }

    if (!isClientRequest && creator.role !== "DESIGNER") {
      return res.status(400).json({ error: "Only accounts with role DESIGNER can create a post." });
    }

    let quoteInquiryId: string | null = null;
    if (isClientRequest) {
      const defaultStore = await prisma.store.findFirst();
      if (defaultStore) {
        const piece = await prisma.piece.create({
          data: {
            storeId: defaultStore.id,
            name: caption?.split("\n")[0] || "Custom Dress Design",
            description: caption || "Custom Beviks costume request from patron",
            price: budget ? parseFloat(budget) : 0,
            primaryImageUrl: media?.[0]?.url || "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600&auto=format&fit=crop&q=80",
            category: "CUSTOM",
            heritage: "Custom",
          }
        });

        const inquiry = await prisma.quoteInquiry.create({
          data: {
            pieceId: piece.id,
            designerId: defaultStore.designerId,
            customerId: designerId,
            specialInstructions: caption,
            budget: budget ? parseFloat(budget) : 0,
            status: "PENDING",
          }
        });
        quoteInquiryId = inquiry.id;
      }
    }

    const canRequestQuote = Boolean(quoteEnabled || isClientRequest || quoteInquiryId);

    const post = await prisma.post.create({
      data: {
        designerId,
        caption,
        quoteEnabled: canRequestQuote,
        isClientRequest: isClientRequest || false,
        budget: budget ? parseFloat(budget) : null,
        quoteInquiryId,
        media: {
          create: media.map((m: any, index: number) => ({
            url: m.url,
            type: m.type as any,
            order: m.order ?? index
          }))
        }
      },
      include: {
        media: true,
        designer: {
          select: { id: true, fullName: true, email: true, profileImageUrl: true }
        }
      }
    });

    cache.deletePattern("posts:list");

    return res.status(201).json({
      ...post,
      canRequestQuote: canPostRequestQuote(post),
      likesCount: 0,
      commentsCount: 0,
      isLiked: false
    });
  } catch (error: any) {
    console.error("Create post error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/posts:
 *   get:
 *     summary: Retrieve Pinterest-style Media Feed
 *     description: Fetches a collection of media posts. Supports sorting by latest posts or trending engagement.
 *     tags:
 *       - Posts
 *     parameters:
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [latest, trending]
 *           default: latest
 *         description: Sorting algorithm.
 *       - in: query
 *         name: viewerId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional ID of the currently logged-in user to check if they liked each post.
 *     responses:
 *       200:
 *         description: Media feed array retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PostResponse'
 */
storePostRouter.get("/", async (req: Request, res: Response): Promise<any> => {
  try {
    const sort = req.query.sort as string || "latest";
    const viewerId = req.query.viewerId as string | undefined;

    const cacheKey = `posts:list:${sort}:${viewerId || "anon"}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const posts = await prisma.post.findMany({
      include: {
        media: {
          orderBy: { order: "asc" }
        },
        designer: {
          select: { id: true, fullName: true, email: true, profileImageUrl: true }
        },
        likes: viewerId ? { where: { userId: viewerId } } : false,
        savedPosts: viewerId ? { where: { userId: viewerId } } : false,
        _count: {
          select: { likes: true, comments: true }
        }
      }
    });

    // Populate transient flags (likesCount, commentsCount, isLiked)
    const formattedPosts = posts.map(p => {
      const isLiked = viewerId ? p.likes.length > 0 : false;
      const isSaved = viewerId ? p.savedPosts.length > 0 : false;
      return {
        id: p.id,
        designerId: p.designerId,
        caption: p.caption,
        quoteEnabled: p.quoteEnabled,
        isClientRequest: p.isClientRequest,
        quoteInquiryId: p.quoteInquiryId,
        canRequestQuote: canPostRequestQuote(p),
        budget: p.budget,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        media: p.media,
        designer: p.designer,
        likesCount: p._count.likes,
        commentsCount: p._count.comments,
        isLiked,
        isSaved
      };
    });

    // Handle Sorting Logic
    if (sort === "trending") {
      formattedPosts.sort((a, b) => {
        const scoreA = a.likesCount + a.commentsCount;
        const scoreB = b.likesCount + b.commentsCount;
        return scoreB - scoreA;
      });
    } else {
      formattedPosts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

    cache.set(cacheKey, formattedPosts, 30000); // cache for 30s
    return res.status(200).json(formattedPosts);
  } catch (error: any) {
    console.error("Get posts error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/posts/saved:
 *   get:
 *     summary: Get User's Saved Posts
 *     tags:
 *       - Posts
 */
storePostRouter.get("/saved", async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: "Missing required parameter: userId" });
    }

    const saved = await prisma.savedPost.findMany({
      where: { userId },
      include: {
        post: {
          include: {
            media: true,
            designer: {
              select: {
                id: true,
                fullName: true,
                email: true,
                profileImageUrl: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const posts = saved.map(s => ({
      ...s.post,
      canRequestQuote: canPostRequestQuote(s.post),
      isSaved: true
    }));
    return res.status(200).json({ data: posts });
  } catch (error: any) {
    console.error("Get saved posts error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/posts/{id}:
 *   get:
 *     summary: Retrieve Single Post Detail
 *     description: Fetches a single post including its media assets and complete threaded comment trees.
 *     tags:
 *       - Posts
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: viewerId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Optional ID of the currently logged-in user.
 *     responses:
 *       200:
 *         description: Complete post detail with comment trees.
 *       404:
 *         description: Post not found.
 */
storePostRouter.get("/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const viewerId = req.query.viewerId as string | undefined;

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        media: { orderBy: { order: "asc" } },
        designer: { select: { id: true, fullName: true, email: true, profileImageUrl: true } },
        _count: { select: { likes: true, comments: true } }
      }
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    // Check if liked by me
    let isLiked = false;
    let isSaved = false;
    if (viewerId) {
      const like = await prisma.postLike.findUnique({
        where: { postId_userId: { postId: id, userId: viewerId } }
      });
      isLiked = !!like;

      const savedPost = await prisma.savedPost.findUnique({
        where: { postId_userId: { postId: id, userId: viewerId } }
      });
      isSaved = !!savedPost;
    }

    // Retrieve all comments for this post and map them as a nested replies tree in memory
    const comments = await prisma.comment.findMany({
      where: { postId: id },
      include: {
        user: { select: { id: true, fullName: true, profileImageUrl: true } },
        likes: viewerId ? { where: { userId: viewerId } } : false,
        _count: { select: { likes: true } }
      },
      orderBy: { createdAt: "asc" }
    });

    const commentMap = new Map();
    const commentTree: any[] = [];

    comments.forEach(c => {
      const commentNode = {
        id: c.id,
        parentId: c.parentId,
        content: c.content,
        createdAt: c.createdAt,
        user: c.user,
        likeCount: c._count.likes,
        isLiked: viewerId ? c.likes.length > 0 : false,
        replies: []
      };
      commentMap.set(c.id, commentNode);
      if (!c.parentId) {
        commentTree.push(commentNode);
      } else {
        const parentNode = commentMap.get(c.parentId);
        if (parentNode) {
          parentNode.replies.push(commentNode);
        } else {
          // Parent comment fallback
          commentTree.push(commentNode);
        }
      }
    });

    return res.status(200).json({
      id: post.id,
      designerId: post.designerId,
      caption: post.caption,
      quoteEnabled: post.quoteEnabled,
      isClientRequest: post.isClientRequest,
      quoteInquiryId: post.quoteInquiryId,
      canRequestQuote: canPostRequestQuote(post),
      budget: post.budget,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      media: post.media,
      designer: post.designer,
      likesCount: post._count.likes,
      commentsCount: post._count.comments,
      isLiked,
      isSaved,
      comments: commentTree
    });
  } catch (error: any) {
    console.error("Get single post error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/posts/{id}/heart:
 *   post:
 *     summary: Like / Heart a Post
 *     description: Toggles liking (hearting) a post. If liked, removes it. If not, adds it.
 *     tags:
 *       - Posts
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
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 example: e634127c-9b76-47ee-8cd6-c67ee59d9972
 *     responses:
 *       200:
 *         description: Heart status toggled.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 liked:
 *                   type: boolean
 *                 likesCount:
 *                   type: integer
 */
storePostRouter.post("/:id/heart", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId parameter is required." });
    }

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    // Toggle logic
    const existingLike = await prisma.postLike.findUnique({
      where: {
        postId_userId: { postId: id, userId }
      }
    });

    let liked = false;
    if (existingLike) {
      await prisma.postLike.delete({
        where: {
          postId_userId: { postId: id, userId }
        }
      });
    } else {
      await prisma.postLike.create({
        data: { postId: id, userId }
      });
      liked = true;
    }

    const likesCount = await prisma.postLike.count({ where: { postId: id } });

    if (liked && post.designerId !== userId) {
      const liker = await prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true }
      });
      await prisma.notification.create({
        data: {
          userId: post.designerId,
          type: "SOCIALS",
          title: "Post Hearted",
          message: `${liker?.fullName || "A user"} hearted your post.`,
          referenceId: id
        }
      });
      await sendPushToUser(
        post.designerId,
        "Post Hearted",
        `${liker?.fullName || "A user"} hearted your post.`
      );
    }

    cache.deletePattern("posts:list");

    return res.status(200).json({
      message: liked ? "Heart added." : "Heart removed.",
      liked,
      likesCount
    });
  } catch (error: any) {
    console.error("Toggle post heart error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/posts/{id}/comments:
 *   post:
 *     summary: Add Comment or Reply to Post
 *     description: Adds a text comment to a post, or a nested reply (using parentId).
 *     tags:
 *       - Posts
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
 *               - userId
 *               - content
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *               content:
 *                 type: string
 *                 example: "Fabulous styling!"
 *               parentId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of comment you are replying to (optional).
 *                 example: a5941a7c-9b76-47ee-8cd6-c67ee59d9972
 *     responses:
 *       201:
 *         description: Comment added.
 */
storePostRouter.post("/:id/comments", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const { userId, parentId } = req.body;
    const content = typeof req.body.content === "string" ? req.body.content.trim() : "";

    if (!userId || !content) {
      return res.status(400).json({ error: "userId and content are required parameters." });
    }

    if (content.length > COMMENT_CONTENT_LIMIT) {
      return res.status(400).json({ error: `Comments must be ${COMMENT_CONTENT_LIMIT} characters or fewer.` });
    }

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    let parentComment: { id: string; userId: string; postId: string } | null = null;
    if (parentId) {
      parentComment = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, userId: true, postId: true }
      });
      if (!parentComment) {
        return res.status(404).json({ error: "Parent comment not found." });
      }
      if (parentComment.postId !== id) {
        return res.status(400).json({ error: "Parent comment does not belong to this post." });
      }
    }

    const comment = await prisma.comment.create({
      data: {
        postId: id,
        userId,
        content,
        parentId
      },
      include: {
        user: { select: { id: true, fullName: true, profileImageUrl: true } },
        _count: { select: { likes: true } }
      }
    });

    // Notify post author (if comment was left by someone else)
    if (post.designerId !== userId) {
      await prisma.notification.create({
        data: {
          userId: post.designerId,
          type: "SOCIALS",
          title: "New Comment on Post",
          message: `${comment.user.fullName} commented on your post: "${content.slice(0, 30)}${content.length > 30 ? "..." : ""}"`,
          referenceId: id
        }
      });
      await sendPushToUser(
        post.designerId,
        "New Comment on Post",
        `${comment.user.fullName} commented on your post: "${content.slice(0, 30)}${content.length > 30 ? "..." : ""}"`
      );
    }

    // Notify parent comment author (if this is a nested reply and author is different)
    if (parentId) {
      if (parentComment && parentComment.userId !== userId) {
        await prisma.notification.create({
          data: {
            userId: parentComment.userId,
            type: "SOCIALS",
            title: "New Reply on Comment",
            message: `${comment.user.fullName} replied to your comment: "${content.slice(0, 30)}${content.length > 30 ? "..." : ""}"`,
            referenceId: id
          }
        });
        await sendPushToUser(
          parentComment.userId,
          "New Reply on Comment",
          `${comment.user.fullName} replied to your comment: "${content.slice(0, 30)}${content.length > 30 ? "..." : ""}"`
        );
      }
    }

    cache.deletePattern("posts:list");

    return res.status(201).json({
      ...comment,
      parentId: comment.parentId,
      likeCount: comment._count.likes,
      isLiked: false
    });
  } catch (error: any) {
    console.error("Create comment error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

storePostRouter.post("/comments/:id/replies", async (req: Request, res: Response): Promise<any> => {
  try {
    const parentId = req.params.id as string;
    const { userId } = req.body;
    const content = typeof req.body.content === "string" ? req.body.content.trim() : "";

    if (!userId || !content) {
      return res.status(400).json({ error: "userId and content are required parameters." });
    }

    if (content.length > COMMENT_CONTENT_LIMIT) {
      return res.status(400).json({ error: `Replies must be ${COMMENT_CONTENT_LIMIT} characters or fewer.` });
    }

    const parentComment = await prisma.comment.findUnique({
      where: { id: parentId },
      select: { id: true, userId: true, postId: true }
    });
    if (!parentComment) {
      return res.status(404).json({ error: "Parent comment not found." });
    }

    const post = await prisma.post.findUnique({ where: { id: parentComment.postId } });
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    const comment = await prisma.comment.create({
      data: {
        postId: parentComment.postId,
        userId,
        content,
        parentId
      },
      include: {
        user: { select: { id: true, fullName: true, profileImageUrl: true } },
        _count: { select: { likes: true } }
      }
    });

    if (post.designerId !== userId) {
      await prisma.notification.create({
        data: {
          userId: post.designerId,
          type: "SOCIALS",
          title: "New Comment on Post",
          message: `${comment.user.fullName} commented on your post: "${content.slice(0, 30)}${content.length > 30 ? "..." : ""}"`,
          referenceId: parentComment.postId
        }
      });
      await sendPushToUser(
        post.designerId,
        "New Comment on Post",
        `${comment.user.fullName} commented on your post: "${content.slice(0, 30)}${content.length > 30 ? "..." : ""}"`
      );
    }

    if (parentComment.userId !== userId) {
      await prisma.notification.create({
        data: {
          userId: parentComment.userId,
          type: "SOCIALS",
          title: "New Reply on Comment",
          message: `${comment.user.fullName} replied to your comment: "${content.slice(0, 30)}${content.length > 30 ? "..." : ""}"`,
          referenceId: parentComment.postId
        }
      });
      await sendPushToUser(
        parentComment.userId,
        "New Reply on Comment",
        `${comment.user.fullName} replied to your comment: "${content.slice(0, 30)}${content.length > 30 ? "..." : ""}"`
      );
    }

    cache.deletePattern("posts:list");

    return res.status(201).json({
      ...comment,
      parentId: comment.parentId,
      likeCount: comment._count.likes,
      isLiked: false
    });
  } catch (error: any) {
    console.error("Create comment reply error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/comments/{id}/like:
 *   post:
 *     summary: Like / Unlike a Comment
 *     description: Toggles a user's like status on a specific comment.
 *     tags:
 *       - Posts
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The comment ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Comment like status toggled.
 */
storePostRouter.post("/comments/:id/like", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId parameter is required." });
    }

    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) {
      return res.status(404).json({ error: "Comment not found." });
    }

    const existingLike = await prisma.commentLike.findUnique({
      where: {
        commentId_userId: { commentId: id, userId }
      }
    });

    let liked = false;
    if (existingLike) {
      await prisma.commentLike.delete({
        where: {
          commentId_userId: { commentId: id, userId }
        }
      });
    } else {
      await prisma.commentLike.create({
        data: { commentId: id, userId }
      });
      liked = true;
    }

    const likesCount = await prisma.commentLike.count({ where: { commentId: id } });

    return res.status(200).json({
      message: liked ? "Comment liked." : "Comment unliked.",
      liked,
      likesCount
    });
  } catch (error: any) {
    console.error("Toggle comment like error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});



/**
 * @openapi
 * /api/posts/{id}/share:
 *   get:
 *     summary: Generate Shareable Public URL
 *     description: Returns a public link that can be shared externally to view the post.
 *     tags:
 *       - Posts
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Share link generated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 shareUrl:
 *                   type: string
 *                   example: "https://beviks.com/posts/e634127c-9b76-47ee-8cd6-c67ee59d9972"
 */
storePostRouter.get("/:id/preview", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const payload = await getPostSharePayload(req, id);

    if (!payload) {
      return res.status(404).json({ error: "Post not found." });
    }

    const title = escapeHtml(payload.title);
    const description = escapeHtml(payload.description);
    const shareUrl = escapeHtml(payload.shareUrl);
    const deepLink = escapeHtml(payload.deepLink);
    const imageUrl = escapeHtml(payload.imageUrl);

    return res
      .status(200)
      .type("html")
      .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:url" content="${shareUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${imageUrl}" />
    <meta http-equiv="refresh" content="1;url=${deepLink}" />
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Arial, sans-serif; background: #ffffff; color: #111111; }
      main { width: min(420px, calc(100vw - 32px)); text-align: center; }
      img { width: 100%; border-radius: 16px; object-fit: cover; aspect-ratio: 4 / 5; background: #f4f4f4; }
      a { display: inline-flex; margin-top: 18px; padding: 14px 20px; border-radius: 999px; background: #bc000a; color: #ffffff; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      ${imageUrl ? `<img src="${imageUrl}" alt="${title}" />` : ""}
      <h1>${title}</h1>
      <a href="${deepLink}">Open in Beviks</a>
    </main>
    <script>
      window.setTimeout(function () {
        window.location.href = "${deepLink}";
      }, 350);
    </script>
  </body>
</html>`);
  } catch (error: any) {
    console.error("Preview post error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

storePostRouter.get("/:id/share", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const payload = await getPostSharePayload(req, id);

    if (!payload) {
      return res.status(404).json({ error: "Post not found." });
    }

    return res.status(200).json(payload);
  } catch (error: any) {
    console.error("Share post error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/posts/{id}/save:
 *   post:
 *     summary: Toggle Save / Bookmark Post
 *     tags:
 *       - Posts
 */
storePostRouter.post("/:id/save", async (req: Request, res: Response): Promise<any> => {
  try {
    const postId = req.params.id as string;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing required field: userId" });
    }

    const existing = await prisma.savedPost.findUnique({
      where: {
        postId_userId: { postId, userId }
      }
    });

    if (existing) {
      await prisma.savedPost.delete({
        where: {
          postId_userId: { postId, userId }
        }
      });
      cache.deletePattern("posts:list");
      return res.status(200).json({ message: "Post removed from saved list.", saved: false });
    } else {
      await prisma.savedPost.create({
        data: { postId, userId }
      });
      cache.deletePattern("posts:list");
      return res.status(200).json({ message: "Post saved successfully!", saved: true });
    }
  } catch (error: any) {
    console.error("Save post error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/posts/{id}:
 *   delete:
 *     summary: Delete Post (Owner only)
 *     tags:
 *       - Posts
 */
storePostRouter.delete("/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing required field: userId" });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { designerId: true }
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    if (post.designerId !== userId) {
      return res.status(403).json({ error: "Only the person who posted this can delete it." });
    }

    await prisma.post.delete({ where: { id } });
    cache.deletePattern("posts:list");
    return res.status(200).json({ message: "Post deleted successfully." });
  } catch (error: any) {
    console.error("Delete post error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/posts/{id}/related:
 *   get:
 *     summary: Retrieve Related / Recommended Posts for a Given Post
 *     tags:
 *       - Posts
 */
storePostRouter.get("/:id/related", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const viewerId = req.query.viewerId as string | undefined;
    const posts = await prisma.post.findMany({
      where: { id: { not: id } },
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        designer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            profileImageUrl: true
          }
        },
        media: true,
        likes: viewerId ? { where: { userId: viewerId } } : false,
        savedPosts: viewerId ? { where: { userId: viewerId } } : false,
        _count: {
          select: { likes: true, comments: true }
        }
      }
    });

    return res.status(200).json(posts.map(p => ({
      id: p.id,
      designerId: p.designerId,
      caption: p.caption,
      quoteEnabled: p.quoteEnabled,
      isClientRequest: p.isClientRequest,
      quoteInquiryId: p.quoteInquiryId,
      canRequestQuote: canPostRequestQuote(p),
      budget: p.budget,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      media: p.media,
      designer: p.designer,
      likesCount: p._count.likes,
      commentsCount: p._count.comments,
      isLiked: viewerId ? p.likes.length > 0 : false,
      isSaved: viewerId ? p.savedPosts.length > 0 : false
    })));
  } catch (error: any) {
    console.error("Get related posts error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
