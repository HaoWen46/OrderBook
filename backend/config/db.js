const mysql = require('mysql2');
require('dotenv').config();  // Load .env variables

const pool = mysql.createPool({
  host:     process.env.DB_HOST || 'localhost',
  port:     process.env.DB_PORT || 3306,
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'orderbook',
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool.promise();
