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

  console.log(`[ORDER_DEBUG] Incoming order for user ${userId}: Symbol ${symbol_id}, Side ${side}, Price ${price}, Quantity ${quantity}, Type ${type}`);

  if (!symbol_id || !side || !quantity || isNaN(quantity) || quantity <= 0) {
    console.log(`[ORDER_DEBUG] Invalid order parameters: symbol_id=${symbol_id}, side=${side}, quantity=${quantity}`);
    return res.status(400).json({ message: 'Missing or invalid order parameters' });
  }
  if (side !== 'buy' && side !== 'sell') {
    console.log(`[ORDER_DEBUG] Invalid order side: ${side}`);
    return res.status(400).json({ message: 'Invalid order side' });
  }
  if (type === 'limit') {
    if (price === undefined || price === null || Number(price) <= 0) {
      console.log(`[ORDER_DEBUG] Invalid price for limit order: ${price}`);
      return res.status(400).json({ message: 'Invalid price for limit order' });
    }
    price = Number(price);
  } else {
    price = null;
  }

  // Maker‑maker cross prevention for limit orders
  if (type === 'limit') {
    if (side === 'buy') {
      const [[{ bestAsk }]] = await pool.query(
        `SELECT MIN(price) AS bestAsk
          FROM orders
          WHERE symbol_id = ? AND side = 'sell' AND status = 'OPEN'`,
        [symbol_id]
      );
      if (bestAsk !== null && price >= parseFloat(bestAsk)) {
        console.log(`[ORDER_DEBUG] Limit buy price ${price} crosses best ask ${bestAsk}.`);
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
        console.log(`[ORDER_DEBUG] Limit sell price ${price} crosses best bid ${bestBid}.`);
        return res.status(400).json({
          message:
            'Limit sell price must be **higher** than the current best bid; ' +
            'use a market order if you want to cross the spread.'
        });
      }
    }
  }

  try {
    const [[symRow]] = await pool.query(
      'SELECT symbol, outstanding_shares, last_price FROM symbols WHERE id = ?',
      [symbol_id]
    );
    if (!symRow) {
      console.log(`[ORDER_DEBUG] Symbol not found: ${symbol_id}`);
      return res.status(404).json({ message: 'Symbol not found' });
    }
    const totalShares = symRow.outstanding_shares;

    const [[userAccount]] = await pool.query(
      'SELECT cash_balance FROM users WHERE id = ?',
      [userId]
    );
    const userCash = userAccount ? parseFloat(userAccount.cash_balance) : 0;
    console.log(`[ORDER_DEBUG] User ${userId} cash balance fetched: ${userCash}.`);

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
          console.log(`[ORDER_DEBUG] Insufficient funds for buy order. User cash: ${userCash}, required: ${totalCost}`);
          return res.status(400).json({ message: 'Insufficient funds for buy order' });
        }
      }
    } else if (side === 'sell') {
      if (quantity > userPos) {
        const shortQty = quantity - (userPos > 0 ? userPos : 0);
        if (shortQty > totalShares) {
          console.log(`[ORDER_DEBUG] Sell order quantity ${quantity} exceeds available shares ${totalShares} in circulation for user ${userId}.`);
          return res.status(400).json({ message: 'Order exceeds available shares in circulation' });
        }
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      console.log(`[ORDER_DEBUG] Transaction begun for user ${userId}.`);

      // Reserve funds for limit buy orders upfront
      if (side === 'buy' && type === 'limit') {
        const totalCost = price * quantity;
        console.log(`[ORDER_DEBUG] LIMIT BUY: Deducting ${totalCost} from user ${userId} cash balance. Initial balance: ${userCash}.`);
        await conn.query(
          'UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?',
          [totalCost, userId]
        );
        console.log(`[ORDER_DEBUG] LIMIT BUY: Cash deduction query executed.`);
      }

      let newOrderId = null;
      let remainingQty = quantity;
      // Store trade details for post-processing cash adjustments for self-trades
      const tradesExecuted = []; 

      if (type === 'market') {
        console.log(`[ORDER_DEBUG] Processing MARKET order for user ${userId}.`);
        const sideToHit = (side === 'buy') ? 'sell' : 'buy';
        const orderByClause = (side === 'buy') ? 'price ASC, id ASC' : 'price DESC, id ASC';
        // Select maker order's price and quantity
        const [bookOrders] = await conn.query(
          `SELECT id, user_id, price, quantity, side FROM orders 
            WHERE symbol_id = ? 
              AND side = ? 
              AND status = 'OPEN'
            ORDER BY ${orderByClause} 
            FOR UPDATE`,
          [symbol_id, sideToHit]
        );
        let currentCash = userCash;
        for (const order of bookOrders) { // 'order' is the resting (maker) order
          if (remainingQty === 0) break;
          const matchQty = Math.min(remainingQty, order.quantity);
          const tradePrice = parseFloat(order.price); // Trade price is the maker's price

          if (side === 'buy') { // Incoming MARKET order is BUY (taker), resting order is SELL (maker)
            if (currentCash < tradePrice * matchQty) {
              console.log(`[ORDER_DEBUG] Market buy: Insufficient cash to fill remaining ${remainingQty} at price ${tradePrice}. Breaking.`);
              break;
            }
          }
          
          console.log(`[ORDER_DEBUG] Market order matching: Trade ${matchQty} shares at ${tradePrice}. Maker Order ID: ${order.id}, Maker User ID: ${order.user_id}.`);
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
              side
            ]
          );

          const newQty = order.quantity - matchQty;
          await conn.query(
            'UPDATE orders SET quantity = ?, status = ? WHERE id = ?',
            [newQty, newQty === 0 ? 'FILLED' : 'OPEN', order.id]
          );

          if (side === 'buy') { // Incoming MARKET order is BUY (taker), resting order is SELL (maker)
            // Buyer (taker) pays cash, seller (maker) receives cash
            console.log(`[ORDER_DEBUG] Market Buy: Deducting ${tradePrice * matchQty} from Taker (Buyer) user ${userId}.`);
            await conn.query(
              'UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?',
              [tradePrice * matchQty, userId]  // deduct from buyer (taker)
            );
            console.log(`[ORDER_DEBUG] Market Buy: Crediting ${tradePrice * matchQty} to Maker (Seller) user ${order.user_id}.`);
            await conn.query(
              'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
              [tradePrice * matchQty, order.user_id]  // credit to seller (maker)
            );
            
            console.log(`[ORDER_DEBUG] Position update: Increasing quantity by ${matchQty} for Buyer (Taker) user ${userId}.`);
            await conn.query(
              `INSERT INTO positions (user_id, symbol_id, quantity)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
              [userId, symbol_id, matchQty, matchQty]
            );
            console.log(`[ORDER_DEBUG] Position update: Decreasing quantity by ${matchQty} for Seller (Maker) user ${order.user_id}.`);
            await conn.query(
              `INSERT INTO positions (user_id, symbol_id, quantity)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE quantity = quantity - ?`,
              [order.user_id, symbol_id, -matchQty, matchQty]
            );
            currentCash -= tradePrice * matchQty;
          } else { // Incoming MARKET order is SELL (taker), resting order is BUY (maker)
            // Seller (taker) receives cash, buyer (maker) pays cash
            console.log(`[ORDER_DEBUG] Market Sell: Crediting ${tradePrice * matchQty} to Taker (Seller) user ${userId}.`);
            await conn.query(
              'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
              [tradePrice * matchQty, userId]   // credit cash to seller (taker)
            );
            console.log(`[ORDER_DEBUG] Market Sell: Debiting ${tradePrice * matchQty} from Maker (Buyer) user ${order.user_id}.`);
            await conn.query(
              'UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?',
              [tradePrice * matchQty, order.user_id]  // deduct cash from buyer (maker)
            );
            
            // Positions: Seller (taker) decreases, Buyer (maker) increases
            console.log(`[ORDER_DEBUG] Position update: Decreasing quantity by ${matchQty} for Seller (Taker) user ${userId}.`);
            await conn.query(
              `INSERT INTO positions (user_id, symbol_id, quantity)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE quantity = quantity - ?`,
              [userId, symbol_id, -matchQty, matchQty]
            );
            console.log(`[ORDER_DEBUG] Position update: Increasing quantity by ${matchQty} for Buyer (Maker) user ${order.user_id}.`);
            await conn.query(
              `INSERT INTO positions (user_id, symbol_id, quantity)
               VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
              [order.user_id, symbol_id, matchQty, matchQty]
            );
          }

          // Store trade details for later self-trade cash adjustment
          tradesExecuted.push({
            price: tradePrice, // Trade execution price
            quantity: matchQty,
            buyOrderId: order.side === 'buy' ? order.id : null, // If maker was a BUY order
            buyUserId: order.side === 'buy' ? order.user_id : null,
            sellOrderId: order.side === 'sell' ? order.id : null, // If maker was a SELL order
            sellUserId: order.side === 'sell' ? order.user_id : null,
            takerUserId: userId,
            takerSide: side,
            // Capture the original limit price of the maker order if it was a buy, for self-trade refund
            makerOriginalPrice: parseFloat(order.price)
          });
          remainingQty -= matchQty;
        }

        if (tradesExecuted.length === 0) {
          console.log(`[ORDER_DEBUG] Market order could not be filled (no liquidity). Rolling back.`);
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
        await conn.query('DELETE FROM positions WHERE quantity = 0');

        // *** CRUCIAL FINAL CASH ADJUSTMENT FOR SELF-TRADES (AFTER MARKET ORDER PROCESSING) ***
        // This loop applies specifically to trades that occurred during THIS market order.
        for (const trade of tradesExecuted) {
            // Check if this trade was a self-trade, AND involved a buy order that was the maker.
            // This is the scenario where a user's market SELL order hit their own LIMIT BUY order.
            if (trade.buyOrderId !== null && trade.buyUserId === trade.takerUserId && trade.takerSide === 'sell') {
                // The `trade.buyUserId` is the user whose limit buy order (maker) was filled.
                // The `trade.takerUserId` is the user who placed the market sell (taker).
                // If they are the same user, it's a self-trade.

                // The cash for this buy order was initially RESERVED based on its limit price (`makerOriginalPrice`).
                // Since it's a self-trade where the user effectively bought shares (from themselves) and immediately
                // sold them (to themselves), resulting in no net position change, the initial reservation
                // needs to be fully refunded.
                const amountToRefundFromReserved = trade.makerOriginalPrice * trade.quantity;
                
                if (amountToRefundFromReserved > 0) {
                    console.log(`[ORDER_DEBUG] Self-Trade (Market Sell hitting Limit Buy) Adjustment: Refunding original reserved amount ${amountToRefundFromReserved} for buy order ID ${trade.buyOrderId} to user ${trade.buyUserId}.`);
                    await conn.query(
                        'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
                        [amountToRefundFromReserved, trade.buyUserId]
                    );
                }
            }
        }
        // ********************************************************************************
        
        await conn.commit();
        console.log(`[ORDER_DEBUG] Market order committed for user ${userId}.`);
        return res.json({
          message: 'Market order processed',
          orderStatus: remainingQty === 0 ? 'FILLED' : 'PARTIAL',
          tradesExecuted
        });
      }

      // --- Limit Order: place in order book and then attempt matching as taker if possible ---
      console.log(`[ORDER_DEBUG] Processing LIMIT order for user ${userId}.`);
      const [insertResult] = await conn.query(
        'INSERT INTO orders (user_id, symbol_id, side, price, quantity, status) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, symbol_id, side, price, remainingQty, 'OPEN']
      );
      newOrderId = insertResult.insertId;
      console.log(`[ORDER_DEBUG] New limit order inserted with ID: ${newOrderId}, remainingQty: ${remainingQty}.`);

      if (side === 'buy') { // Incoming LIMIT order is BUY (taker), resting order is SELL (maker)
        const [sellOrders] = await conn.query(
          `SELECT id, user_id, price, quantity, side FROM orders 
             WHERE symbol_id = ? AND side = 'sell' AND status = 'OPEN' 
             AND price <= ? 
             ORDER BY price ASC, id ASC 
             FOR UPDATE`,
          [symbol_id, price]
        );
        for (const sellOrder of sellOrders) {
          if (remainingQty <= 0) {
            console.log(`[ORDER_DEBUG] Limit buy order ${newOrderId}: remaining quantity is 0 or less. Breaking matching loop.`);
            break;
          }
          const matchQty = Math.min(remainingQty, sellOrder.quantity);
          const tradePrice = parseFloat(sellOrder.price); // Trade price is the maker's price
          const takerSide = 'buy';
          
          console.log(`[ORDER_DEBUG] Limit buy order ${newOrderId} matching with sell order ${sellOrder.id}: Trade ${matchQty} shares at ${tradePrice}.`);
          await conn.query(
            `INSERT INTO trades 
               (symbol_id, price, quantity, buy_order_id, sell_order_id, buy_user_id, sell_user_id, taker_side)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [symbol_id, tradePrice, matchQty, newOrderId, sellOrder.id, userId, sellOrder.user_id, takerSide]
          );
          remainingQty -= matchQty;
          console.log(`[ORDER_DEBUG] Order ${newOrderId} remaining quantity after trade: ${remainingQty}.`);

          const newSellQty = sellOrder.quantity - matchQty;
          await conn.query(
            'UPDATE orders SET quantity = ?, status = ? WHERE id = ?',
            [newSellQty, newSellQty === 0 ? 'FILLED' : 'OPEN', sellOrder.id]
          );
          // Positions: Buyer (taker) gains, Seller (maker) loses
          console.log(`[ORDER_DEBUG] Position update: Increasing quantity by ${matchQty} for Buyer (Taker) user ${userId}.`);
          await conn.query(
            `INSERT INTO positions (user_id, symbol_id, quantity)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
            [userId, symbol_id, matchQty, matchQty]
          );
          console.log(`[ORDER_DEBUG] Position update: Decreasing quantity by ${matchQty} for Seller (Maker) user ${sellOrder.user_id}.`);
          await conn.query(
            `INSERT INTO positions (user_id, symbol_id, quantity)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = quantity - ?`,
            [sellOrder.user_id, symbol_id, -matchQty, matchQty]
          );
          // Cash transfers: Seller (maker) receives
          console.log(`[ORDER_DEBUG] Limit Buy: Crediting ${tradePrice * matchQty} to Maker (Seller) user ${sellOrder.user_id}.`);
          await conn.query(
            'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
            [tradePrice * matchQty, sellOrder.user_id]  // credit seller (maker)
          );
          // Refund difference to buyer (taker) if trade price is lower than limit price
          // Buyer was initially debited for 'price * quantity'.
          // For this matched portion, they should only pay 'tradePrice * matchQty'.
          const buyerRefundForThisTrade = (price - tradePrice) * matchQty;
          if (buyerRefundForThisTrade > 0) {
            console.log(`[ORDER_DEBUG] Refunding ${buyerRefundForThisTrade} to Taker (Buyer) user ${userId} for better fill price on limit buy order ${newOrderId}.`);
            await conn.query(
              'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
              [buyerRefundForThisTrade, userId]
            );
          }
          tradesExecuted.push({
            price: tradePrice,
            quantity: matchQty,
            buyOrderId: newOrderId, // This new order is the taker buy
            buyUserId: userId,
            sellOrderId: sellOrder.id, // existing order is maker sell
            sellUserId: sellOrder.user_id,
            takerUserId: userId, // New order is the taker
            takerSide: takerSide,
            makerOriginalPrice: parseFloat(sellOrder.price) // Maker's original price (sell order's price)
          });
          if (remainingQty === 0) break;
        }
      } else if (side === 'sell') { // Incoming LIMIT order is SELL (taker), resting order is BUY (maker)
        const [buyOrders] = await conn.query(
          `SELECT id, user_id, price, quantity, side FROM orders 
             WHERE symbol_id = ? AND side = 'buy' AND status = 'OPEN' 
             AND price >= ? 
             ORDER BY price DESC, id ASC 
             FOR UPDATE`,
          [symbol_id, price]
        );
        for (const buyOrder of buyOrders) {
          if (remainingQty <= 0) {
            console.log(`[ORDER_DEBUG] Limit sell order ${newOrderId}: remaining quantity is 0 or less. Breaking matching loop.`);
            break;
          }
          const matchQty = Math.min(remainingQty, buyOrder.quantity);
          const tradePrice = parseFloat(buyOrder.price); // Trade price is the maker's price
          const takerSide = 'sell';
          console.log(`[ORDER_DEBUG] Limit sell order ${newOrderId} matching with buy order ${buyOrder.id}: Trade ${matchQty} shares at ${tradePrice}.`);
          await conn.query(
            `INSERT INTO trades 
               (symbol_id, price, quantity, buy_order_id, sell_order_id, buy_user_id, sell_user_id, taker_side)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [symbol_id, tradePrice, matchQty, buyOrder.id, newOrderId, buyOrder.user_id, userId, takerSide]
          );
          remainingQty -= matchQty;
          console.log(`[ORDER_DEBUG] Order ${newOrderId} remaining quantity after trade: ${remainingQty}.`);

          const newBuyQty = buyOrder.quantity - matchQty;
          await conn.query(
            'UPDATE orders SET quantity = ?, status = ? WHERE id = ?',
            [newBuyQty, newBuyQty === 0 ? 'FILLED' : 'OPEN', buyOrder.id]
          );
          // Positions: Buyer (maker) gains, Seller (taker) loses
          console.log(`[ORDER_DEBUG] Position update: Increasing quantity by ${matchQty} for Buyer (Maker) user ${buyOrder.user_id}.`);
          await conn.query(
            `INSERT INTO positions (user_id, symbol_id, quantity)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
            [buyOrder.user_id, symbol_id, matchQty, matchQty]
          );
          console.log(`[ORDER_DEBUG] Position update: Decreasing quantity by ${matchQty} for Seller (Taker) user ${userId}.`);
          await conn.query(
            `INSERT INTO positions (user_id, symbol_id, quantity)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = quantity - ?`,
            [userId, symbol_id, -matchQty, matchQty]
          );
          // Cash transfers: Buyer (maker) pays, Seller (taker) receives
          console.log(`[ORDER_DEBUG] Limit Sell: Debiting ${tradePrice * matchQty} from Maker (Buyer) user ${buyOrder.user_id}.`);
          await conn.query(
            'UPDATE users SET cash_balance = cash_balance - ? WHERE id = ?',
            [tradePrice * matchQty, buyOrder.user_id]
          );
          console.log(`[ORDER_DEBUG] Limit Sell: Crediting ${tradePrice * matchQty} to Taker (Seller) user ${userId}.`);
          await conn.query(
            'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
            [tradePrice * matchQty, userId]
          );
          tradesExecuted.push({
            price: tradePrice,
            quantity: matchQty,
            buyOrderId: buyOrder.id, // existing order is maker buy
            buyUserId: buyOrder.user_id,
            sellOrderId: newOrderId, // new order is taker sell
            sellUserId: userId,
            takerUserId: userId, // New order is the taker
            takerSide: takerSide,
            makerOriginalPrice: parseFloat(buyOrder.price) // Maker's original price (buy order's price)
          });
          if (remainingQty === 0) break;
        }
      }

      // Update the new order's final quantity and status in the order book
      if (remainingQty > 0) {
        console.log(`[ORDER_DEBUG] Order ${newOrderId} is PARTIAL or OPEN. Remaining quantity: ${remainingQty}.`);
        await conn.query(
          'UPDATE orders SET quantity = ? WHERE id = ?',
          [remainingQty, newOrderId]
        );
      } else {
        console.log(`[ORDER_DEBUG] Order ${newOrderId} is FILLED. Setting quantity to 0.`);
        await conn.query(
          'UPDATE orders SET status = ?, quantity = 0 WHERE id = ?',
          ['FILLED', newOrderId]
        );
      }

      // *** CRUCIAL FINAL CASH ADJUSTMENT FOR BUY LIMIT ORDERS AFTER ALL MATCHING (INCLUDING SELF-TRADES) ***
      // This loop runs after all trades for the current order are processed.
      // It handles cases where a BUY LIMIT order (newly placed or existing) was filled.
      for (const trade of tradesExecuted) {
        // If this trade involved a BUY order (either the new order or a maker order)
        // AND that BUY order was a LIMIT order (which caused upfront cash reservation)
        // AND the user is the same as the user who placed the buy order
        if (trade.buyOrderId !== null && trade.buyUserId === userId) {
            // Retrieve the original limit price of the BUY order that was filled.
            // (We already stored `makerOriginalPrice` in `tradesExecuted` for maker orders,
            // and `price` is available for the newly placed order.)
            const originalBuyLimitPrice = (trade.buyOrderId === newOrderId && type === 'limit' && side === 'buy')
                                            ? price // If the newly placed order was the limit buy that got filled
                                            : trade.makerOriginalPrice; // If an existing limit buy order (maker) got filled

            // Calculate the amount initially reserved for this specific matched quantity based on original limit price
            const reservedAmountForThisTrade = originalBuyLimitPrice * trade.quantity;
            // Calculate the actual amount spent for this specific matched quantity based on trade price
            const actualSpentAmount = trade.price * trade.quantity;

            // The difference between reserved and actual spent needs to be refunded to the buyer.
            // This handles both (a) external fills at a better price, and (b) self-trades
            // where the original reservation needs to be reconciled.
            const refundAmount = reservedAmountForThisTrade - actualSpentAmount;

            if (refundAmount > 0) {
                console.log(`[ORDER_DEBUG] Post-Trade Buy Limit Refund: Refunding ${refundAmount} to user ${trade.buyUserId} for order ID ${trade.buyOrderId}. (Reserved: ${reservedAmountForThisTrade}, Spent: ${actualSpentAmount})`);
                await conn.query(
                    'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
                    [refundAmount, trade.buyUserId]
                );
            } else {
               console.log(`[ORDER_DEBUG] Post-Trade Buy Limit Refund: No additional refund for order ID ${trade.buyOrderId}, refundAmount was ${refundAmount}. (Reserved: ${reservedAmountForThisTrade}, Spent: ${actualSpentAmount})`);
            }
        }
      }
      // ********************************************************************************

      // Update symbol last_price and prev_price if any trade executed
      if (tradesExecuted.length > 0) {
        const lastTradePrice = tradesExecuted[tradesExecuted.length - 1].price;
        const prevPrice = symRow.last_price !== null ? symRow.last_price : lastTradePrice;
        console.log(`[ORDER_DEBUG] Updating symbol ${symbol_id} prices. Prev: ${prevPrice}, Last: ${lastTradePrice}.`);
        await conn.query(
          'UPDATE symbols SET prev_price = ?, last_price = ? WHERE id = ?',
          [prevPrice, lastTradePrice, symbol_id]
        );
      } else {
        console.log(`[ORDER_DEBUG] No trades executed for order ${newOrderId}. Symbol price not updated.`);
      }

      await conn.query('DELETE FROM positions WHERE quantity = 0');
      console.log(`[ORDER_DEBUG] Cleaning up zero quantity positions.`);

      await conn.commit();
      console.log(`[ORDER_DEBUG] Transaction committed successfully for order ${newOrderId}.`);
      const status = (remainingQty === 0 ? 'FILLED' : (tradesExecuted.length > 0 ? 'PARTIAL' : 'OPEN'));
      res.json({ message: 'Order placed', orderStatus: status, tradesExecuted });
    } catch (err) {
      await conn.rollback();
      console.error(`[ERROR] Transaction rolled back for order placement for user ${userId}, symbol ${symbol_id}. Details:`, err.message, err.stack);
      res.status(500).json({ message: 'Error processing order' });
    } finally {
      conn.release();
      console.log(`[ORDER_DEBUG] Database connection released for user ${userId}.`);
    }
  } catch (err) {
    console.error(`[ERROR] Server error placing order (outside transaction) for user ${userId}, symbol ${symbol_id}. Details:`, err.message, err.stack);
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
  console.log(`[CANCEL_DEBUG] Attempting to cancel order ${orderId} for user ${userId}.`);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query(
      'SELECT * FROM orders WHERE id = ? AND user_id = ? AND status = "OPEN" FOR UPDATE',
      [orderId, userId]
    );
    if (!order) {
      console.log(`[CANCEL_DEBUG] Order ${orderId} not found, not owned by user ${userId}, or not open.`);
      await conn.rollback();
      return res.status(404).json({ message: 'Order not found or already filled/cancelled' });
    }
    if (order.side === 'buy') {
      const refundAmount = parseFloat(order.price) * order.quantity; // order.quantity is the *remaining* quantity
      if (refundAmount > 0) {
        console.log(`[CANCEL_DEBUG] Refunding ${refundAmount} to user ${userId} for cancelled buy order ${orderId}.`);
        await conn.query(
          'UPDATE users SET cash_balance = cash_balance + ? WHERE id = ?',
          [refundAmount, userId]
        );
      } else {
        console.log(`[CANCEL_DEBUG] No refund needed for buy order ${orderId} as remaining quantity is 0.`);
      }
    } else {
      console.log(`[CANCEL_DEBUG] No refund needed for sell order ${orderId} (cash not reserved upfront).`);
    }
    await conn.query(
      'UPDATE orders SET status = "CANCELLED", quantity = 0 WHERE id = ?',
      [orderId]
    );
    await conn.commit();
    console.log(`[CANCEL_DEBUG] Transaction committed successfully for order ${orderId} cancellation.`);
    res.json({ message: 'Order cancelled successfully' });
  } catch (err) {
    await conn.rollback();
    console.error(`[ERROR] Transaction rolled back for order cancellation for user ${userId}, order ${orderId}. Details:`, err.message, err.stack);
    res.status(500).json({ message: 'Failed to cancel order' });
  } finally {
    conn.release();
    console.log(`[CANCEL_DEBUG] Database connection released for order ${orderId} cancellation.`);
  }
});

module.exports = router;