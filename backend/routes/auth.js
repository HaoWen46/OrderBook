const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

// User Registration
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    // Check if username is taken
    const [users] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (users.length > 0) {
      return res.status(400).json({ message: 'Username already exists' });
    }
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Create new user with default role 'user' and starting cash balance
    const startingCash = 10000.00;
    await pool.query(
      'INSERT INTO users (username, password_hash, role, cash_balance) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, 'user', startingCash]
    );
    res.json({ message: 'Registration successful, please log in' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// User Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.status(400).json({ message: 'Invalid username or password' });
    }
    const user = rows[0];
    const validPass = await bcrypt.compare(password, user.password_hash);
    if (!validPass) {
      return res.status(400).json({ message: 'Invalid username or password' });
    }
    // Generate JWT token (expires in 1 hour)
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    res.json({
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        cash_balance: user.cash_balance
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

const { verifyToken } = require('../middleware/auth'); // ensure this is at top

router.post('/change-password', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required' });
    }

    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(403).json({ message: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hashed, userId]);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error changing password' });
  }
});


module.exports = router;
