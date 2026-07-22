import { Router, Request, Response } from "express";
import { prisma } from "../db.js";

export const searchRouter = Router();

searchRouter.get("/search", async (req: Request, res: Response): Promise<any> => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const take = Math.min(Number(req.query.limit) || 8, 20);

    if (!q) {
      return res.status(200).json({ query: q, users: [], stores: [], pieces: [], collections: [], posts: [] });
    }

    const contains = { contains: q, mode: "insensitive" as const };

    const [users, stores, pieces, collections, posts] = await Promise.all([
      prisma.user.findMany({
        where: {
          isDeleted: false,
          OR: [
            { fullName: contains },
            { bio: contains },
            { email: contains },
          ],
        },
        select: {
          id: true,
          fullName: true,
          role: true,
          bio: true,
          profileImageUrl: true,
          store: { select: { id: true, name: true, logoUrl: true, coverUrl: true } },
        },
        take,
        orderBy: { createdAt: "desc" },
      }),
      prisma.store.findMany({
        where: {
          OR: [
            { name: contains },
            { description: contains },
            { designer: { fullName: contains } },
          ],
        },
        select: {
          id: true,
          designerId: true,
          name: true,
          description: true,
          logoUrl: true,
          coverUrl: true,
          designer: { select: { id: true, fullName: true, profileImageUrl: true } },
        },
        take,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.piece.findMany({
        where: {
          status: "PUBLISHED",
          OR: [
            { name: contains },
            { description: contains },
            { category: contains },
            { heritage: contains },
            { store: { name: contains } },
          ],
        },
        include: {
          images: { orderBy: { order: "asc" } },
          store: { select: { id: true, name: true, designerId: true } },
        },
        take,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.collection.findMany({
        where: {
          OR: [
            { name: contains },
            { story: contains },
            { store: { name: contains } },
          ],
        },
        include: {
          store: { select: { id: true, name: true, designerId: true, logoUrl: true } },
          pieces: { include: { piece: { include: { images: { orderBy: { order: "asc" } } } } } },
        },
        take,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.post.findMany({
        where: {
          OR: [
            { caption: contains },
            { designer: { fullName: contains } },
          ],
        },
        include: {
          media: { orderBy: { order: "asc" } },
          designer: { select: { id: true, fullName: true, profileImageUrl: true } },
          _count: { select: { likes: true, comments: true } },
        },
        take,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return res.status(200).json({
      query: q,
      users,
      stores,
      pieces,
      collections,
      posts: posts.map((post) => ({
        ...post,
        likesCount: post._count.likes,
        commentsCount: post._count.comments,
      })),
    });
  } catch (error: any) {
    console.error("Search error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
