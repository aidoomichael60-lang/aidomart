import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db.ts';
import { requireAuth } from '../middleware.ts';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

function getNotificationCounts(userId: number) {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) AS unreadCount,
         COALESCE(SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END), 0) AS readCount,
         COUNT(*) AS totalCount
       FROM notifications
       WHERE user_id = ?`
    )
    .get(userId) as { unreadCount: number; readCount: number; totalCount: number };

  return {
    unreadCount: Number(row?.unreadCount || 0),
    readCount: Number(row?.readCount || 0),
    totalCount: Number(row?.totalCount || 0),
  };
}

notificationsRouter.get('/', (req: Request, res: Response) => {
  const userId = req.authUser!.id;
  const notifications = db
    .prepare(
      `SELECT id, user_id AS userId, title, message, link, type,
              is_read AS isRead, created_at AS createdAt
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 50`
    )
    .all(userId)
    .map((n: any) => ({ ...n, isRead: Boolean(n.isRead) }));

  return res.json({
    notifications,
    ...getNotificationCounts(userId),
  });
});

notificationsRouter.post('/:id/read', (req: Request, res: Response) => {
  const userId = req.authUser!.id;
  const id = Number(req.params.id);
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(id, userId);
  return res.json({ ok: true, ...getNotificationCounts(userId) });
});

notificationsRouter.post('/read-all', (req: Request, res: Response) => {
  const userId = req.authUser!.id;
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(userId);
  return res.json({ ok: true, ...getNotificationCounts(userId) });
});
