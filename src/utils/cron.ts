import { prisma } from '../db.js';

/**
 * Scheduled cleanup for soft-deleted user accounts.
 * Deletes any user account marked `isDeleted = true` where `deletedAt` is older than 7 days.
 */
export function startWeeklyAccountCleanupCron() {
  if (process.env.ACCOUNT_CLEANUP_ENABLED !== 'true') {
    console.log('[ACCOUNT CLEANUP] Disabled. Set ACCOUNT_CLEANUP_ENABLED=true to purge old soft-deleted users.');
    return;
  }

  const CHECK_INTERVAL = Number(process.env.ACCOUNT_CLEANUP_INTERVAL_MS || 7 * 24 * 60 * 60 * 1000);
  const INITIAL_DELAY = Number(process.env.ACCOUNT_CLEANUP_INITIAL_DELAY_MS || 30 * 60 * 1000);
  const BATCH_SIZE = Number(process.env.ACCOUNT_CLEANUP_BATCH_SIZE || 10);
  let isRunning = false;

  const runCleanup = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const usersToDelete = await prisma.user.findMany({
        where: {
          isDeleted: true,
          deletedAt: {
            lte: sevenDaysAgo,
          },
        },
        select: { id: true },
        orderBy: { deletedAt: 'asc' },
        take: BATCH_SIZE,
      });

      if (usersToDelete.length === 0) return;

      const deletedUsers = await prisma.user.deleteMany({
        where: {
          id: { in: usersToDelete.map((user) => user.id) },
        },
      });

      if (deletedUsers.count > 0) {
        console.log(`[ACCOUNT CLEANUP] Permanently purged ${deletedUsers.count} soft-deleted user accounts older than 7 days.`);
      }
    } catch (err) {
      console.error('[ACCOUNT CLEANUP ERROR]', err);
    } finally {
      isRunning = false;
    }
  };

  setTimeout(runCleanup, INITIAL_DELAY);
  setInterval(runCleanup, CHECK_INTERVAL);
}
