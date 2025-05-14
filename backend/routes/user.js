const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

// Get current user profile (and positions)
router.get('/me', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    // Fetch user basic info
    const [users] = await pool.query(
      'SELECT id, username, role, cash_balance FROM users WHERE id = ?',
      [userId]
    );
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    const user = users[0];
    // Fetch user's positions (holdings) joined with symbol info
    const [positions] = await pool.query(
      'SELECT s.id AS symbol_id, s.symbol, p.quantity ' +
      'FROM positions p JOIN symbols s ON p.symbol_id = s.id ' +
      'WHERE p.user_id = ?',
      [userId]
    );
    user.positions = positions;
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error retrieving user data' });
  }
});

// Delete account
router.delete('/me', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get this user's role
    const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });

    const userRole = rows[0].role;

    if (userRole === 'manager') {
      // Count how many managers exist
      const [managerCountRows] = await pool.query(
        'SELECT COUNT(*) AS count FROM users WHERE role = "manager"'
      );
      const managerCount = managerCountRows[0].count;

      if (managerCount <= 1) {
        return res.status(403).json({ message: 'You are the last manager. Assign another manager before deleting this account.' });
      }
    }

    // Safe to delete
    await pool.query('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error deleting account' });
  }
});

module.exports = router;
