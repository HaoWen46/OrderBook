-- Create database and use it
DROP DATABASE IF EXISTS orderbook;
CREATE DATABASE IF NOT EXISTS orderbook;
USE orderbook;

-- Users table
CREATE TABLE users (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  username     VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role         ENUM('user','manager') NOT NULL DEFAULT 'user',
  cash_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00
);

-- Symbols (trading instruments)
CREATE TABLE symbols (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  symbol             VARCHAR(20) NOT NULL UNIQUE,
  type               ENUM('stock','call','put') NOT NULL DEFAULT 'stock',
  last_price         DECIMAL(15,2) DEFAULT NULL,
  prev_price         DECIMAL(15,2) DEFAULT NULL,
  outstanding_shares INT NOT NULL DEFAULT 0,
);

-- Positions (user holdings for each symbol)
CREATE TABLE positions (
  user_id   INT NOT NULL,
  symbol_id INT NOT NULL,
  quantity  INT NOT NULL,
  PRIMARY KEY(user_id, symbol_id),
  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);

-- Orders (open orders in the order book)
-- Orders (open orders in the order book)
CREATE TABLE orders (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  user_id   INT NOT NULL,
  symbol_id INT NOT NULL,
  side      ENUM('buy','sell') NOT NULL,
  price     DECIMAL(15,2) NOT NULL,
  quantity  INT NOT NULL,
  status    ENUM('OPEN','FILLED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)  REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);

-- Trades (executed trades history)
CREATE TABLE trades (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  symbol_id      INT NOT NULL,
  price          DECIMAL(15,2) NOT NULL,
  quantity       INT NOT NULL,
  buy_order_id   INT,
  sell_order_id  INT,
  buy_user_id    INT,
  sell_user_id   INT,
  taker_side     ENUM('buy','sell') NOT NULL,
  timestamp      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (symbol_id)     REFERENCES symbols(id) ON DELETE CASCADE,
  FOREIGN KEY (buy_order_id)  REFERENCES orders(id)  ON DELETE SET NULL,
  FOREIGN KEY (sell_order_id) REFERENCES orders(id)  ON DELETE SET NULL,
  FOREIGN KEY (buy_user_id)   REFERENCES users(id)   ON DELETE SET NULL,
  FOREIGN KEY (sell_user_id)  REFERENCES users(id)   ON DELETE SET NULL
);

-- Insert a default admin (manager) user and some example symbols
INSERT INTO users (username, password_hash, role, cash_balance)
VALUES ('admin', '$2b$10$NEYmC66cpeymCCItRyPhTeMpEYSHXxNVosc7eq57ED4908nYDyy8O', 'manager', 100000.00);
-- (The password for 'admin' is 'admin', hashed using bcrypt)

INSERT INTO symbols (symbol, type) VALUES 
('TSLA', 'stock'),
('GOOG', 'stock');