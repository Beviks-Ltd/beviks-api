import { Router, Request, Response } from "express";
import { prisma } from "../db.js";

export const storePostRouter = Router();

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
    const { designerId, caption, media, quoteEnabled } = req.body;

    if (!designerId || !media || !Array.isArray(media) || media.length === 0) {
      return res.status(400).json({ error: "designerId and at least one media item are required." });
    }

    const designer = await prisma.user.findUnique({ where: { id: designerId } });
    if (!designer) {
      return res.status(404).json({ error: "Designer account not found." });
    }

    if (designer.role !== "DESIGNER") {
      return res.status(400).json({ error: "Only accounts with role DESIGNER can create a post." });
    }

    const post = await prisma.post.create({
      data: {
        designerId,
        caption,
        quoteEnabled: quoteEnabled || false,
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
          select: { id: true, fullName: true, email: true }
        }
      }
    });

    return res.status(201).json({
      ...post,
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

    const posts = await prisma.post.findMany({
      include: {
        media: {
          orderBy: { order: "asc" }
        },
        designer: {
          select: { id: true, fullName: true, email: true }
        },
        likes: viewerId ? { where: { userId: viewerId } } : false,
        _count: {
          select: { likes: true, comments: true }
        }
      }
    });

    // Populate transient flags (likesCount, commentsCount, isLiked)
    const formattedPosts = posts.map(p => {
      const isLiked = viewerId ? p.likes.length > 0 : false;
      return {
        id: p.id,
        designerId: p.designerId,
        caption: p.caption,
        quoteEnabled: p.quoteEnabled,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        media: p.media,
        designer: p.designer,
        likesCount: p._count.likes,
        commentsCount: p._count.comments,
        isLiked
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

    return res.status(200).json(formattedPosts);
  } catch (error: any) {
    console.error("Get posts error:", error);
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
        designer: { select: { id: true, fullName: true, email: true } },
        _count: { select: { likes: true, comments: true } }
      }
    });

    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    // Check if liked by me
    let isLiked = false;
    if (viewerId) {
      const like = await prisma.postLike.findUnique({
        where: { postId_userId: { postId: id, userId: viewerId } }
      });
      isLiked = !!like;
    }

    // Retrieve all comments for this post and map them as a nested replies tree in memory
    const comments = await prisma.comment.findMany({
      where: { postId: id },
      include: {
        user: { select: { id: true, fullName: true } },
        _count: { select: { likes: true } }
      },
      orderBy: { createdAt: "asc" }
    });

    const commentMap = new Map();
    const commentTree: any[] = [];

    comments.forEach(c => {
      const commentNode = {
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        user: c.user,
        likeCount: c._count.likes,
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
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      media: post.media,
      designer: post.designer,
      likesCount: post._count.likes,
      commentsCount: post._count.comments,
      isLiked,
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
    const { userId, content, parentId } = req.body;

    if (!userId || !content) {
      return res.status(400).json({ error: "userId and content are required parameters." });
    }

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    if (parentId) {
      const parentComment = await prisma.comment.findUnique({ where: { id: parentId } });
      if (!parentComment) {
        return res.status(404).json({ error: "Parent comment not found." });
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
        user: { select: { id: true, fullName: true } }
      }
    });

    return res.status(201).json(comment);
  } catch (error: any) {
    console.error("Create comment error:", error);
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
 * /api/posts/{id}/quote-request:
 *   post:
 *     summary: Request Dress Quote from Designer
 *     description: Requests a custom dress quote based on a post. Only succeeds if quoteEnabled was activated on the post.
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
 *               - customerId
 *             properties:
 *               customerId:
 *                 type: string
 *                 format: uuid
 *               notes:
 *                 type: string
 *                 example: "I would love this dress in emerald green, size M. Can I get a quote?"
 *     responses:
 *       201:
 *         description: Quote request successfully logged and sent to the designer.
 *       400:
 *         description: Quote requests are disabled on this post or invalid parameters.
 */
storePostRouter.post("/:id/quote-request", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const { customerId, notes } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: "customerId is a required parameter." });
    }

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    if (!post.quoteEnabled) {
      return res.status(400).json({ error: "Quote requests are disabled for this designer post." });
    }

    const quoteRequest = await prisma.quoteRequest.create({
      data: {
        postId: id,
        designerId: post.designerId,
        customerId,
        notes
      },
      include: {
        customer: { select: { id: true, fullName: true, email: true } },
        post: {
          select: {
            id: true,
            caption: true,
            designer: { select: { id: true, fullName: true } }
          }
        }
      }
    });

    console.log(`[Quote Alert] Customer ${quoteRequest.customer.fullName} requested quote from Designer ${quoteRequest.post.designer.fullName} on Post ${quoteRequest.post.caption || id}`);

    return res.status(201).json({
      message: "Quote request successfully submitted to the designer.",
      quoteRequest
    });
  } catch (error: any) {
    console.error("Quote request error:", error);
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
storePostRouter.get("/:id/share", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) {
      return res.status(404).json({ error: "Post not found." });
    }

    const shareUrl = `https://beviks.com/posts/${id}`;

    return res.status(200).json({ shareUrl });
  } catch (error: any) {
    console.error("Share post error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
