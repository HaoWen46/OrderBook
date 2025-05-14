const express = require("express");
const Database = require("better-sqlite3");
const app = express();
const db = new Database("orderbook.db");
const port = 3001;

// Test route
app.get("/orders", (req, res) => {
  const orders = db.prepare("SELECT * FROM orders").all();
  res.json(orders);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

app.get("/", (req, res) => {
    res.send("🎉 Welcome to the Order Book Simulator API!");
  });
  
const cors = require('cors');
app.use(cors());