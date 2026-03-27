import { Router } from 'express';
import { pool } from '../../config/database';

const router = Router();

/**
 * GET /api/notifications?address=0x...
 * List notifications for a wallet address (latest 50, unread first)
 */
router.get('/', async (req, res) => {
  try {
    const address = (req.query.address as string)?.toLowerCase();
    if (!address) {
      return res.status(400).json({ error: 'address query parameter is required' });
    }

    const result = await pool.query(
      `SELECT id, type, title, message, link, is_read, created_at
       FROM notifications
       WHERE wallet_address = $1
       ORDER BY is_read ASC, created_at DESC
       LIMIT 50`,
      [address]
    );

    return res.json({ notifications: result.rows });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/notifications/unread-count?address=0x...
 * Get unread notification count for badge display
 */
router.get('/unread-count', async (req, res) => {
  try {
    const address = (req.query.address as string)?.toLowerCase();
    if (!address) {
      return res.status(400).json({ error: 'address query parameter is required' });
    }

    const result = await pool.query(
      `SELECT COUNT(*)::int as count
       FROM notifications
       WHERE wallet_address = $1 AND is_read = false`,
      [address]
    );

    return res.json({ count: result.rows[0].count });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a single notification as read
 */
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1',
      [id]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification read:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * PUT /api/notifications/read-all?address=0x...
 * Mark all notifications as read for a wallet address
 */
router.put('/read-all', async (req, res) => {
  try {
    const address = (req.query.address as string)?.toLowerCase();
    if (!address) {
      return res.status(400).json({ error: 'address query parameter is required' });
    }

    await pool.query(
      'UPDATE notifications SET is_read = true WHERE wallet_address = $1 AND is_read = false',
      [address]
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
