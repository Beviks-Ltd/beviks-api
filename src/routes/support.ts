import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';

export const supportRouter = Router();

/**
 * GET /api/support/tickets
 * List all support tickets for a user
 */
supportRouter.get('/tickets', async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId query parameter is required.' });
    }

    const tickets = await prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return res.status(200).json({ tickets });
  } catch (error: any) {
    console.error('Fetch support tickets error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/support/tickets
 * Create a new support ticket
 */
supportRouter.post('/tickets', async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, subject, category, message } = req.body;

    if (!userId || !subject || !message) {
      return res.status(400).json({ error: 'userId, subject, and message are required.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    const ticketNumber = `TICK-${Math.floor(1000 + Math.random() * 9000)}`;

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        userId,
        subject,
        category: category || 'GENERAL',
        status: 'OPEN',
        lastMessage: message,
        messages: {
          create: {
            senderId: userId,
            senderName: user.fullName,
            senderRole: 'USER',
            content: message,
          },
        },
      },
      include: {
        messages: true,
      },
    });

    return res.status(201).json({
      message: 'Support ticket created successfully.',
      ticket,
    });
  } catch (error: any) {
    console.error('Create support ticket error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/support/tickets/:ticketId/messages
 * Get all messages for a support ticket
 */
supportRouter.get('/tickets/:ticketId/messages', async (req: Request, res: Response): Promise<any> => {
  try {
    const ticketId = req.params.ticketId as string;

    const messages = await prisma.supportMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
    });

    return res.status(200).json({ messages });
  } catch (error: any) {
    console.error('Fetch ticket messages error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/support/tickets/:ticketId/messages
 * Send a message in a support ticket
 */
supportRouter.post('/tickets/:ticketId/messages', async (req: Request, res: Response): Promise<any> => {
  try {
    const ticketId = req.params.ticketId as string;
    const { senderId, content, mediaUrl } = req.body;

    if (!senderId || !content) {
      return res.status(400).json({ error: 'senderId and content are required.' });
    }

    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      return res.status(404).json({ error: 'Support ticket not found.' });
    }

    const user = await prisma.user.findUnique({ where: { id: senderId } });
    const senderName = user ? user.fullName : 'Concierge Specialist';

    const newMessage = await prisma.supportMessage.create({
      data: {
        ticketId,
        senderId,
        senderName,
        senderRole: 'USER',
        content,
        mediaUrl: mediaUrl || null,
      },
    });

    // Update ticket lastMessage and updatedAt
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        lastMessage: content,
        updatedAt: new Date(),
      },
    });

    return res.status(201).json({
      message: 'Support message sent.',
      supportMessage: newMessage,
    });
  } catch (error: any) {
    console.error('Send support message error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});
