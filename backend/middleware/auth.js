const jwt = require('jsonwebtoken');
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];  // Expect "Bearer <token>"
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Attach user id and role to the request for use in routes
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Failed to authenticate token' });
  }
}

function requireManager(req, res, next) {
  if (!req.user || req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Access denied: requires manager role' });
  }
  next();
}

module.exports = { verifyToken, requireManager };
