const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');

/**
 * GET /api/orders/book/:symbolId
 * Fetches the current order book (open buy and sell orders) for a given symbol.
 */
router.get('/book/:symbolId', verifyToken, async (req, res) => {
  try {
    const symbolId = parseInt(req.params.symbolId, 10);
    // Get symbol info (to retrieve last and previous price)
    const [[symbol]] = await pool.query(
      'SELECT symbol, last_price, prev_price FROM symbols WHERE id = ?',
      [symbolId]
    );
    if (!symbol) {
      return res.status(404).json({ message: 'Symbol not found' });
    }
    // Fetch open orders (buy orders descending by price, sell orders ascending)
    const [buyOrders] = await pool.query(
      "SELECT price, quantity FROM orders WHERE symbol_id = ? AND side = 'buy' AND status = 'OPEN' ORDER BY price DESC",
      [symbolId]
    );
    const [sellOrders] = await pool.query(
      "SELECT price, quantity FROM orders WHERE symbol_id = ? AND side = 'sell' AND status = 'OPEN' ORDER BY price ASC",
      [symbolId]
    );
    // Determine price movement direction (up/down/same) based on last vs prev price
    let direction = 'same';
    if (symbol.last_price !== null && symbol.prev_price !== null) {
      if (symbol.last_price > symbol.prev_price) direction = 'up';
      else if (symbol.last_price < symbol.prev_price) direction = 'down';
    }
    res.json({
      symbol: symbol.symbol,
      lastPrice: symbol.last_price,
      priceDirection: direction,
      buyOrders: buyOrders,
      sellOrders: sellOrders
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error retrieving order book' });
  }
});

/**
 * GET /api/orders/trades/:symbolId
 * Retrieves recent trades (last 20 trades) for the given symbol.
 */
router.get('/trades/:symbolId', verifyToken, async (req, res) => {
  try {
    const symbolId = parseInt(req.params.symbolId, 10);
    const [trades] = await pool.query(
      'SELECT price, quantity, taker_side, timestamp FROM trades ' +
      'WHERE symbol_id = ? ORDER BY timestamp DESC LIMIT 20',
      [symbolId]
    );
    res.json({ trades });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error retrieving trades' });
  }
});

/**
 * GET /api/orders/my
 * Retrieves the current user's open orders across all symbols.
 */
router.get('/my', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [orders] = await pool.query(
      `SELECT o.id, o.symbol_id, s.symbol, o.side, o.price, o.quantity 
         FROM orders o 
         JOIN symbols s ON o.symbol_id = s.id 
         WHERE o.user_id = ? AND o.status = 'OPEN'`,
      [userId]
    );
    res.json({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error retrieving user orders' });
  }
});

/**
 * GET /api/orders/myTrades
 * Retrieves the current user's recent trade history (last 20 trades).
 */
router.get('/myTrades', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [trades] = await pool.query(
      `SELECT t.price, t.quantity, t.timestamp, s.symbol,
         CASE 
           WHEN t.buy_user_id = ? THEN 'buy' 
           ELSE 'sell' 
         END AS side
       FROM trades t 
       JOIN symbols s ON t.symbol_id = s.id
       WHERE t.buy_user_id = ? OR t.sell_user_id = ?
       ORDER BY t.timestamp DESC
       LIMIT 20`,
      [userId, userId, userId]
    );
    res.json({ trades });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error retrieving trade history' });
  }
});

// Helper to normalize order type (default to 'limit' if undefined/empty).
function normalizeType(t) {
  return (!t || t === '') ? 'limit' : t.toLowerCase();
}

/**
 * POST /api/orders
 * Places a new order (buy or sell, limit or market).
 * Body: { symbol_id, side ('buy'|'sell'), price (optional for market), quantity, type ('limit'|'market') }
 */
router.post('/', verifyToken, async (req, res) => {
  const userId = req.user.id;
  let { symbol_id, side, price, quantity, type } = req.body;
  side = side?.toLowerCase();
  type = normalizeType(type);
  symbol_id = parseInt(symbol_id, 10);
  quantity = parseInt(quantity, 10);

  if (!symbol_id || !side || !quantity || isNaN(quantity) || quantity <= 0) {
    return res.status(400).json({ message: 'Missing or invalid order parameters' });
  }
  if (side !== 'buy' && side !== 'sell') {
    return res.status(400).json({ message: 'Invalid order side' });
  }
  if (type === 'limit') {
    // For limit orders, price must be provided and positive
    if (price === undefined || price === null || Number(price) <= 0) {
      return res.status(400).json({ message: 'Invalid price for limit order' });
    }
    price = Number(price);
  } else {
    // For market orders, we don't require a price (will use market prices)
    price = null;
  }

  // Maker‑maker cross prevention
  if (type === 'limit') {
    if (side === 'buy') {
      const [[{ bestAsk }]] = await pool.query(
        `SELECT MIN(price) AS bestAsk
          FROM orders
          WHERE symbol_id = ? AND side = 'sell' AND status = 'OPEN'`,
        [symbol_id]
      );
      if (bestAsk !== null && price >= parseFloat(bestAsk)) {
        return res.status(400).json({
          message:
            'Limit buy price must be **lower** than the current best ask; ' +
            'use a market order if you want to cross the spread.'
        });
      }
    } else if (side === 'sell') {
      const [[{ bestBid }]] = await pool.query(
        `SELECT MAX(price) AS bestBid
          FROM orders
          WHERE symbol_id = ? AND side = 'buy' AND status = 'OPEN'`,
        [symbol_id]
      );
      if (bestBid !== null && price <= parseFloat(bestBid)) {
        return res.status(400).json({
          message:
            'Limit sell price must be **higher** than the current best bid; ' +
            'use a market order if you want to cross the spread.'
        });
      }
    }
  }

  try {
    // Fetch symbol details
    const [[symRow]] = await pool.query(
      'SELECT symbol, outstanding_shares, last_price FROM symbols WHERE id = ?',
      [symbol_id]
    );
    if (!symRow) {
      return res.status(404).json({ message: 'Symbol not found' });
    }
    const totalShares = symRow.outstanding_shares;

    // Fetch user's current cash balance and position for this symbol
    const [[userAccount]] = await pool.query(
      'SELECT cash_balance, role FROM users WHERE id = ?',
      [userId]
    );
    const userCash = userAccount ? parseFloat(userAccount.cash_balance) : 0;
    let userPos = 0;
    const [[posRow]] = await pool.query(
      'SELECT quantity FROM positions WHERE user_id = ? AND symbol_id = ?',
      [userId, symbol_id]
    );
    if (posRow) {
      userPos = posRow.quantity;
    }

    // Basic validation against user resources before placing order
    if (side === 'buy') {
      if (type === 'limit') {
        const totalCost = price * quantity;
        if (userCash < totalCost) {
          return res.status(400).json({ message: 'Insufficient funds for buy order' });
        }
      }
      // For market buy, we'll check affordability while matching (see below)
    } else if (side === 'sell') {
      // For sell orders, ensure the user is not selling more than they are allowed (no exceed minted shares)
        // If stock, ensure quantity <= userPos + (available shares to borrow)
        // i.e. cannot short more than outstanding shares
      if (quantity > userPos) {
        const shortQty = quantity - (userPos > 0 ? userPos : 0);
        if (shortQty > totalShares) {
          return res.status(400).json({ message: 'Order exceeds available shares in circulation' });
        }
      }
      if (quantity > userPos) {
        // Short selling the difference
        const shortQty = quantity - (userPos > 0 ? userPos : 0);
        // If limit order, use limit price for max cost; if market, use last price as estimate
        const shortPrice = (type === 'limit') ? price : (symRow.last_price !== null ? symRow.last_price : 0);
        const maxCost = shortPrice * shortQty;
        if (userCash < maxCost) {
          return res.status(400).json({ message: 'Insufficient funds to short sell' });
        }
      }
    }

    // Begin matching logic within a DB transaction
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Reserve funds or collateral if needed before placing the order
      if (side === 'buy' && type === 'limit') {
        // Deduct full amount for limit buy upfront (will refund any difference later)
        const totalCost = price * quantity;
        await conn.query(
          'UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?',
          [totalCost, userId]
        );
      }
      if (side === 'sell' && type === 'limit') {
        // If it's a short-sell (selling more than owned), reserve cash equal to short portion value
        if (quantity > userPos) {
          const shortQty = quantity - (userPos > 0 ? userPos : 0);
          const collateral = price * shortQty;
          if (collateral > 0) {
            await conn.query(
              'UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?',
              [collateral, userId]
            );
          }
        }
      }

      let newOrderId = null;
      let remainingQty = quantity;
      const tradesExecuted = [];

      if (type === 'market') {
        // --- Market Order Execution: Immediate matching without entering order book ---
        // Lock relevant rows in the order book for matching
        const sideToHit = (side === 'buy') ? 'sell' : 'buy';
        // For market orders, no specific price condition; take best available.
        const orderByClause = (side === 'buy') ? 'price ASC, id ASC' : 'price DESC, id ASC';
        const [bookOrders] = await conn.query(
          `SELECT * FROM orders 
             WHERE symbol_id = ? AND side = ? AND status = 'OPEN'
             ORDER BY ${orderByClause} 
             FOR UPDATE`,
          [symbol_id, sideToHit]
        );
        // Execute against the book
        let cashAvailable = userCash;
        for (const order of bookOrders) {
          if (remainingQty === 0) break;
          const matchQty = Math.min(remainingQty, order.quantity);
          const tradePrice = parseFloat(order.price);

          if (side === 'buy') {
            // For a market buy, ensure the buyer has enough cash for this portion
            if (cashAvailable < tradePrice * matchQty) break;  // not enough cash to continue
          }
          // Record the trade in the trades history table
          await conn.query(
            `INSERT INTO trades 
               (symbol_id, price, quantity, buy_order_id, sell_order_id, buy_user_id, sell_user_id, taker_side)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              symbol_id,
              tradePrice,
              matchQty,
              side === 'buy' ? null : order.id,
              side === 'buy' ? order.id : null,
              side === 'buy' ? userId : order.user_id,
              side === 'buy' ? order.user_id : userId,
              side  // taker_side is the side of the incoming market order
            ]
          );

          // Update the matched resting order's remaining quantity and status
          const newQty = order.quantity - matchQty;
          await conn.query(
            'UPDATE orders SET quantity = ?, status = ? WHERE id = ?',
            [newQty, newQty === 0 ? 'FILLED' : 'OPEN', order.id]
          );

          // Cash and position transfers:
          if (side === 'buy') {
            // Buyer (taker) pays cash, seller (maker) receives cash
            await conn.query(
              'UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?',
              [tradePrice * matchQty, userId]  // deduct from buyer
            );
            await conn.query(
              'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
              [tradePrice * matchQty, order.user_id]  // credit to seller
            );
            // Buyer gains shares
            await conn.query(
              `INSERT INTO positions (user_id, symbol_id, quantity)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
              [userId, symbol_id, matchQty, matchQty]
            );
            // Seller loses shares (for the maker's position; could go negative if it was a short sale)
            await conn.query(
              `INSERT INTO positions (user_id, symbol_id, quantity)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE quantity = quantity - ?`,
              [order.user_id, symbol_id, -matchQty, matchQty]
            );
            // Update buyer's available cash tracker for market buy loop
            cashAvailable -= tradePrice * matchQty;
          } else {
            // side === 'sell' (seller is taker, buyer is maker)
            // Seller (taker) receives cash, buyer (maker) pays cash
            await conn.query(
              'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
              [tradePrice * matchQty, userId]   // credit cash to seller (taker)
            );
            await conn.query(
              'UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?',
              [tradePrice * matchQty, order.user_id]  // deduct cash from buyer (maker)
            );
            // Seller's position decreases (short position increases in magnitude if they sold more than they had)
            await conn.query(
              `INSERT INTO positions (user_id, symbol_id, quantity)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE quantity = quantity - ?`,
              [userId, symbol_id, -matchQty, matchQty]
            );
            // Buyer's position increases (they gain the shares)
            await conn.query(
              `INSERT INTO positions (user_id, symbol_id, quantity)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
              [order.user_id, symbol_id, matchQty, matchQty]
            );
          }

          tradesExecuted.push({ price: tradePrice, quantity: matchQty });
          remainingQty -= matchQty;
        }

        if (tradesExecuted.length === 0) {
          // No trades could be executed (no liquidity)
          await conn.rollback();
          return res.status(400).json({ message: 'No liquidity to fill market order' });
        }
        // Update last_price and prev_price for the symbol based on the last trade executed
        const lastTradePrice = tradesExecuted[tradesExecuted.length - 1].price;
        const prevPrice = symRow.last_price !== null ? symRow.last_price : lastTradePrice;
        await conn.query(
          'UPDATE symbols SET prev_price = ?, last_price = ? WHERE id = ?',
          [prevPrice, lastTradePrice, symbol_id]
        );
        // Clean up any zero-quantity position rows
        await conn.query('DELETE FROM positions WHERE quantity = 0');
        await conn.commit();
        return res.json({
          message: 'Market order processed',
          orderStatus: remainingQty === 0 ? 'FILLED' : 'PARTIAL',
          tradesExecuted
        });
      }  // End of market order processing

      // --- Limit Order: place in order book and then attempt matching as taker if possible ---
      // Insert the new order into the order book as OPEN
      const [insertResult] = await conn.query(
        'INSERT INTO orders (user_id, symbol_id, side, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, symbol_id, side, price !== null ? price : 0, remainingQty, 'OPEN']
      );
      newOrderId = insertResult.insertId;

      if (side === 'buy') {
        // Match the new buy order (taker) against lowest sell orders (makers)
        const [sellOrders] = await conn.query(
          `SELECT * FROM orders 
             WHERE symbol_id = ? AND side = 'sell' AND status = 'OPEN' 
             AND price <= ? 
             ORDER BY price ASC, id ASC 
             FOR UPDATE`,
          [symbol_id, price]
        );
        for (const sellOrder of sellOrders) {
          if (remainingQty <= 0) break;
          const matchQty = Math.min(remainingQty, sellOrder.quantity);
          const tradePrice = parseFloat(sellOrder.price);
          const takerSide = 'buy';
          // Record the trade
          await conn.query(
            `INSERT INTO trades 
               (symbol_id, price, quantity, buy_order_id, sell_order_id, buy_user_id, sell_user_id, taker_side)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [symbol_id, tradePrice, matchQty, newOrderId, sellOrder.id, userId, sellOrder.user_id, takerSide]
          );
          // Decrease remaining quantity to buy
          remainingQty -= matchQty;
          // Update the matched sell order's quantity/status
          const newSellQty = sellOrder.quantity - matchQty;
          await conn.query(
            'UPDATE orders SET quantity = ?, status = ? WHERE id = ?',
            [newSellQty, newSellQty === 0 ? 'FILLED' : 'OPEN', sellOrder.id]
          );
          // Update positions: buyer gains shares, seller loses shares
          await conn.query(
            `INSERT INTO positions (user_id, symbol_id, quantity)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
            [userId, symbol_id, matchQty, matchQty]
          );
          await conn.query(
            `INSERT INTO positions (user_id, symbol_id, quantity)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = quantity - ?`,
            [sellOrder.user_id, symbol_id, -matchQty, matchQty]  // seller position decreases (may go negative if short)
          );
          // Cash transfers: buyer pays, seller receives
          await conn.query(
            'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
            [tradePrice * matchQty, sellOrder.user_id]  // credit seller
          );
          // Note: We already debited buyer's cash upfront for full quantity. We'll refund any excess below.
          tradesExecuted.push({ price: tradePrice, quantity: matchQty });
          if (remainingQty === 0) break;
        }
      } else if (side === 'sell') {
        // Match the new sell order (taker) against highest buy orders (makers)
        const [buyOrders] = await conn.query(
          `SELECT * FROM orders 
             WHERE symbol_id = ? AND side = 'buy' AND status = 'OPEN' 
             AND price >= ? 
             ORDER BY price DESC, id ASC 
             FOR UPDATE`,
          [symbol_id, price]
        );
        for (const buyOrder of buyOrders) {
          if (remainingQty <= 0) break;
          const matchQty = Math.min(remainingQty, buyOrder.quantity);
          const tradePrice = parseFloat(buyOrder.price);
          const takerSide = 'sell';
          await conn.query(
            `INSERT INTO trades 
               (symbol_id, price, quantity, buy_order_id, sell_order_id, buy_user_id, sell_user_id, taker_side)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [symbol_id, tradePrice, matchQty, buyOrder.id, newOrderId, buyOrder.user_id, userId, takerSide]
          );
          remainingQty -= matchQty;
          // Update matched buy order
          const newBuyQty = buyOrder.quantity - matchQty;
          await conn.query(
            'UPDATE orders SET quantity = ?, status = ? WHERE id = ?',
            [newBuyQty, newBuyQty === 0 ? 'FILLED' : 'OPEN', buyOrder.id]
          );
          // Update positions: buyer (maker) gains shares, seller (taker) loses shares
          await conn.query(
            `INSERT INTO positions (user_id, symbol_id, quantity)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
            [buyOrder.user_id, symbol_id, matchQty, matchQty]
          );
          await conn.query(
            `INSERT INTO positions (user_id, symbol_id, quantity)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = quantity - ?`,
            [userId, symbol_id, -matchQty, matchQty]
          );
          // Cash transfers: buyer pays, seller receives
          await conn.query(
            'UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?',
            [tradePrice * matchQty, buyOrder.user_id]  // deduct buyer's cash
          );
          await conn.query(
            'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
            [tradePrice * matchQty, userId]  // credit seller
          );
          tradesExecuted.push({ price: tradePrice, quantity: matchQty });
          if (remainingQty === 0) break;
        }
      }

      // Update the new order's remaining quantity and status in the order book
      if (remainingQty > 0) {
        // Order was only partially filled or not filled at all
        await conn.query(
          'UPDATE orders SET quantity = ? WHERE id = ?',
          [remainingQty, newOrderId]
        );
      } else {
        // Order fully filled
        await conn.query(
          'UPDATE orders SET status = ?, quantity = 0 WHERE id = ?',
          ['FILLED', newOrderId]
        );
      }

      // Refund excess reserved cash for limit buy or short sell if fully filled with less quantity or at better price
      if (side === 'buy' && type === 'limit') {
        if (remainingQty < quantity) {
          // Some or all filled – calculate total spent vs reserved
          const totalSpent = tradesExecuted.reduce((sum, t) => sum + (t.price * t.quantity), 0);
          const totalReserved = price * quantity;
          const refund = totalReserved - totalSpent;
          if (refund > 0) {
            await conn.query(
              'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
              [refund, userId]
            );
          }
        }
      }
      if (side === 'sell' && type === 'limit') {
        if (quantity > userPos) {
          // If short sell had reserved collateral, refund unused portion
          const shortQtyInitial = quantity - (userPos > 0 ? userPos : 0);
          // Collateral initially reserved = price * shortQtyInitial
          // Calculate short quantity actually executed:
          const shortQtyExecuted = tradesExecuted.reduce((sum, t) => sum + t.quantity, 0) - (userPos > 0 ? Math.min(userPos, tradesExecuted.reduce((sum, t) => sum + t.quantity, 0)) : 0);
          // shortQtyExecuted = total sold beyond what user owned (approximation)
          // Actually, simpler: remaining short portion not executed = (shortQtyInitial - (quantity - remainingQty - userPosRemaining))
          // For simplicity, if order fully filled or partially, we'll refund based on remainingQty:
          const remainingShortQty = remainingQty - (userPos > 0 ? Math.max(0, userPos - (quantity - remainingQty)) : 0);
          // remainingShortQty is the part of initial short that didn't execute
          const refundCollateral = price * (remainingShortQty > 0 ? remainingShortQty : 0);
          if (refundCollateral > 0) {
            await conn.query(
              'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
              [refundCollateral, userId]
            );
          }
        }
      }

      // Update symbol last_price and prev_price if any trade executed
      if (tradesExecuted.length > 0) {
        const lastTradePrice = tradesExecuted[tradesExecuted.length - 1].price;
        const prevPrice = symRow.last_price !== null ? symRow.last_price : lastTradePrice;
        await conn.query(
          'UPDATE symbols SET prev_price = ?, last_price = ? WHERE id = ?',
          [prevPrice, lastTradePrice, symbol_id]
        );
      }

      // Clean up any zero-quantity positions
      await conn.query('DELETE FROM positions WHERE quantity = 0');

      await conn.commit();
      const status = (remainingQty === 0 ? 'FILLED' : (remainingQty < quantity ? 'PARTIAL' : 'OPEN'));
      res.json({ message: 'Order placed', orderStatus: status, tradesExecuted });
    } catch (err) {
      // On any error, rollback the transaction and restore reserved funds if needed
      await conn.rollback();
      console.error(err);
      res.status(500).json({ message: 'Error processing order' });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error placing order' });
  }
});

/**
 * DELETE /api/orders/:id
 * Cancels an open order (if it belongs to the current user and is still OPEN).
 */
router.delete('/:id', verifyToken, async (req, res) => {
  const orderId = parseInt(req.params.id, 10);
  const userId = req.user.id;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Lock the order row for update
    const [[order]] = await conn.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = "OPEN" FOR UPDATE',
      [orderId, userId]
    );
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ message: 'Order not found or already filled/cancelled' });
    }
    // If it’s a buy order, refund the reserved cash (price * remaining quantity)
    if (order.side === 'buy') {
      const refundAmount = parseFloat(order.price) * order.quantity;
      await conn.query(
        'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
        [refundAmount, userId]
      );
    }
    // If it’s a sell order that was a short (user had reserved collateral), refund that as well
    if (order.side === 'sell') {
      // Determine user's position at time of order placement to know short portion.
      // Easiest: if user currently has negative position due to this order (and not yet covered), or if their position in this symbol increased after placing order.
      // We will conservatively refund based on order's price * remaining quantity (assuming that was reserved).
      if (order.quantity > 0) {
        const refundCollateral = parseFloat(order.price) * order.quantity;
        await conn.query(
          'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
          [refundCollateral, userId]
        );
      }
    }
    // Mark the order as cancelled in the order book
    await conn.query(
      'UPDATE orders SET status = "CANCELLED", quantity = 0 WHERE id = ?',
      [orderId]
    );
    await conn.commit();
    res.json({ message: 'Order cancelled successfully' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Failed to cancel order' });
  } finally {
    conn.release();
  }
});

module.exports = router;
