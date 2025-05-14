const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Route modules
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const symbolRoutes = require('./routes/symbols');
const orderRoutes = require('./routes/orders');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/symbols', symbolRoutes);
app.use('/api/orders', orderRoutes);

// Health check route (optional)
app.get('/', (req, res) => {
  res.send('Order Book API is running');
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
