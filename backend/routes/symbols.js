const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken, requireManager } = require('../middleware/auth');
const MAX_BATCH = 1_000_000;

// Get all trading symbols
router.get('/', async (req, res) => {
  try {
    const [symbols] = await pool.query(
      'SELECT id, symbol FROM symbols'
    );
    res.json({ symbols });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error retrieving symbols' });
  }
});

// Add a new trading symbol (manager only)
router.post('/', verifyToken, requireManager, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { symbol } = req.body;
    // Only allow creating stock symbols directly.
    if (!symbol) {
      return res.status(400).json({ message: 'Can only create stock symbols directly' });
    }
    // Ensure symbol name is unique
    const [exists] = await conn.query('SELECT id FROM symbols WHERE symbol = ?', [symbol]);
    if (exists.length > 0) {
      return res.status(400).json({ message: 'Symbol already exists' });
    }
    await conn.beginTransaction();
    // Insert the new stock symbol
    const [result] = await conn.query(
      'INSERT INTO symbols (symbol) VALUES (?)',
      [symbol]
    );
    const newStockId = result.insertId;
    await conn.commit();
    const newSymbol = { id: newStockId, symbol };
    res.json({ message: 'Symbol added', symbol: newSymbol });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error adding symbol' });
  } finally {
    conn.release();
  }
});

// Delete a symbol (manager only)
router.delete('/:id', verifyToken, requireManager, async (req, res) => {
  try {
    const symbolId = parseInt(req.params.id, 10);
    // Check if symbol exists
    const [symRows] = await pool.query('SELECT * FROM symbols WHERE id = ?', [symbolId]);
    if (symRows.length === 0) {
      return res.status(404).json({ message: 'Symbol not found' });
    }
    const sym = symRows[0];
    // Prevent deletion if symbol or its options have open orders or positions
    const [openOrders] = await pool.query(
      'SELECT id FROM orders WHERE symbol_id = ? AND status = "OPEN"',
      [symbolId]
    );
    const [openPos] = await pool.query('SELECT user_id FROM positions WHERE symbol_id = ?', [symbolId]);
    let optOpenOrder = false;
    let optOpenPos = false;
    if (openOrders.length > 0 || openPos.length > 0 || optOpenOrder || optOpenPos) {
      return res.status(400).json({ message: 'Cannot delete symbol with active orders/positions' });
    }
    // Delete underlying stock (cascades to options, orders, positions, trades)
    await pool.query('DELETE FROM symbols WHERE id = ?', [symbolId]);
    res.json({ message: 'Symbol deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error deleting symbol' });
  }
});

/* POST /api/symbols/:id/issue
 * Body: { quantity }
 * Only managers, only STOCK, cap 1e6 per call.
 */
router.post('/:id/issue', verifyToken, requireManager, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const symbolId = parseInt(req.params.id, 10);
    const qty      = parseInt(req.body.quantity, 10);

    if (!qty || qty <= 0 || qty > MAX_BATCH) {
      return res.status(400).json({ message: `Quantity must be 1–${MAX_BATCH}` });
    }

    // ─── validate symbol ───────────────────────────────────────────────────────
    const [[sym]] = await conn.query('SELECT * FROM symbols WHERE id = ?', [symbolId]);
    if (!sym)                return res.status(404).json({ message: 'Symbol not found' });

    // ─── tx: bump position + outstanding ───────────────────────────────────────
    await conn.beginTransaction();

    await conn.query(
      `INSERT INTO positions (user_id, symbol_id, quantity)
       VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [req.user.id, symbolId, qty]
    );

    await conn.query(
      'UPDATE symbols SET outstanding_shares = outstanding_shares + ? WHERE id = ?',
      [qty, symbolId]
    );

    await conn.commit();
    res.json({ message: `Minted ${qty} ${sym.symbol} shares to you` });
  } catch (e) {
    await conn.rollback();
    console.error('⛔️ Mint error:', e.sqlMessage || e.message);
    res.status(500).json({ message: 'Share minting failed – see server log' });
  } finally {
    conn.release();
  }
});

/**
 * POST /api/symbols/:id/burn
 * Body: { quantity: <int> }
 * Managers can burn (destroy) shares they own, up to their balance.
 */
router.post('/:id/burn', verifyToken, requireManager, async (req, res) => {
  try {
    const symbolId  = req.params.id;
    const qty       = Number(req.body.quantity);

    if (!qty || qty <= 0) {
      return res.status(400).json({ message: `quantity must be a positive number` });
    }

    // Fetch symbol
    const [rows] = await pool.query('SELECT * FROM symbols WHERE id = ?', [symbolId]);
    if (!rows.length) return res.status(404).json({ message: 'Symbol not found' });
    const sym = rows[0];
    const userId = req.user.id;

    // Get manager's current position
    const [posRows] = await pool.query(
      'SELECT quantity FROM positions WHERE user_id = ? AND symbol_id = ?',
      [userId, symbolId]
    );
    if (!posRows.length || posRows[0].quantity < qty) {
      return res.status(400).json({ message: 'Insufficient shares to burn' });
    }

    // Transaction time
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Subtract from position
      await conn.query(
        'UPDATE positions SET quantity = quantity - ? WHERE user_id = ? AND symbol_id = ?',
        [qty, userId, symbolId]
      );

      // If shares drop to 0, you could optionally DELETE that row, but not required

      // Subtract from outstanding
      await conn.query(
        'UPDATE symbols SET outstanding_shares = outstanding_shares - ? WHERE id = ?',
        [qty, symbolId]
      );

      await conn.commit();
      res.json({ message: `Burned ${qty} ${sym.symbol} shares` });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ message: 'Burning failed' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error burning shares' });
  }
});

module.exports = router;
