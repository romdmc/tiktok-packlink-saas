require('dotenv').config();

const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Stripe = require('stripe');
const fetch = require('node-fetch');

// Initialise Stripe with secret key (if defined).  Note: In development you must set STRIPE_SECRET_KEY.
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

// Connect to PostgreSQL using DATABASE_URL.  The table structure is created at startup.
const db = new Client({ connectionString: process.env.DATABASE_URL });
db.connect().catch((err) => {
  console.error('Failed to connect to DB', err);
  process.exit(1);
});

async function init() {
  // Register CORS for all origins.  In production adjust as needed.
  await fastify.register(cors, { origin: true });

  // Create users table if it doesn't exist.
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      tiktok_access_token TEXT,
      tiktok_refresh_token TEXT,
      packlink_api_key TEXT,
      automation_enabled BOOLEAN DEFAULT FALSE,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      stripe_subscription_item_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

  function signToken(user) {
    return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  }

  async function getUserFromToken(request) {
    const auth = request.headers.authorization;
    if (!auth) return null;
    const token = auth.split(' ')[1];
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [payload.id]);
      return rows[0] || null;
    } catch (err) {
      return null;
    }
  }

  // User registration
  fastify.post('/api/signup', async (request, reply) => {
    const { email, password } = request.body;
    if (!email || !password) {
      return reply.code(400).send({ error: 'Missing email or password' });
    }
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return reply.code(400).send({ error: 'Email already exists' });
    }
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, hash]
    );
    const user = rows[0];
    const token = signToken(user);
    reply.send({ token, user: { id: user.id, email: user.email } });
  });

  // User login
  fastify.post('/api/login', async (request, reply) => {
    const { email, password } = request.body;
    if (!email || !password) {
      return reply.code(400).send({ error: 'Missing email or password' });
    }
    const res = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (res.rows.length === 0) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
    const user = res.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }
    const token = signToken(user);
    reply.send({ token, user: { id: user.id, email: user.email } });
  });

  // Fetch current user info
  fastify.get('/api/me', async (request, reply) => {
    const user = await getUserFromToken(request);
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    reply.send({ id: user.id, email: user.email });
  });

  // Retrieve setup status
  fastify.get('/api/setup/status', async (request, reply) => {
    const user = await getUserFromToken(request);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    reply.send({
      id: user.id,
      email: user.email,
      tiktok_connected: !!user.tiktok_access_token,
      packlink_connected: !!user.packlink_api_key,
      automation_enabled: user.automation_enabled
    });
  });

  // Save Packlink API key and automation toggle
  fastify.post('/api/setup/save', async (request, reply) => {
    const user = await getUserFromToken(request);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    const { packlinkApiKey, automationEnabled } = request.body;
    await db.query(
      'UPDATE users SET packlink_api_key = $1, automation_enabled = $2 WHERE id = $3',
      [packlinkApiKey || null, !!automationEnabled, user.id]
    );
    const updated = await db.query('SELECT * FROM users WHERE id = $1', [user.id]);
    const u = updated.rows[0];
    reply.send({
      message: 'Saved',
      automation_enabled: u.automation_enabled,
      packlink_connected: !!u.packlink_api_key
    });
  });

  // Toggle automation flag
  fastify.post('/api/automation/toggle', async (request, reply) => {
    const user = await getUserFromToken(request);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    const newState = !user.automation_enabled;
    await db.query('UPDATE users SET automation_enabled = $1 WHERE id = $2', [newState, user.id]);
    reply.send({ automation_enabled: newState });
  });

  // Create Stripe checkout session for subscription + metered pricing
  fastify.post('/api/billing/create-session', async (request, reply) => {
    const user = await getUserFromToken(request);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    if (!stripe) return reply.code(500).send({ error: 'Stripe not configured' });
    try {
      const frontUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: user.email,
        line_items: [
          { price: process.env.STRIPE_PRICE_ID, quantity: 1 },
          { price: process.env.STRIPE_METERED_PRICE_ID, quantity: 0 }
        ],
        success_url: `${frontUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontUrl}/dashboard?canceled=true`
      });
      reply.send({ url: session.url });
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ error: 'Failed to create checkout session' });
    }
  });

  // Stripe webhook to store subscription item ID
  fastify.post('/api/billing/webhook', async (request, reply) => {
    const sig = request.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        request.rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return reply.code(400).send(`Webhook Error: ${err.message}`);
    }
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const customerEmail = session.customer_email;
      const subscriptionId = session.subscription;
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const itemId = subscription.items.data.find(
          (i) => i.price.id === process.env.STRIPE_METERED_PRICE_ID
        )?.id;
        if (customerEmail && itemId) {
          const users = await db.query('SELECT * FROM users WHERE email = $1', [customerEmail]);
          if (users.rows.length) {
            const u = users.rows[0];
            await db.query(
              'UPDATE users SET stripe_customer_id = $1, stripe_subscription_id = $2, stripe_subscription_item_id = $3 WHERE id = $4',
              [
                session.customer,
                subscriptionId,
                itemId,
                u.id
              ]
            );
          }
        }
      } catch (err) {
        fastify.log.error(err);
      }
    }
    reply.send({ received: true });
  });

  // TikTok OAuth: return redirect URL for user to authorize
  fastify.get('/api/auth/tiktok', async (request, reply) => {
    const user = await getUserFromToken(request);
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const redirectUri = encodeURIComponent(process.env.TIKTOK_REDIRECT_URI || '');
    const state = `${user.id}-${Date.now()}`;
    const scope = 'shop.fulfillment.readonly,shop.fulfillment.update';
    const url = `https://auth.tiktok-shops.com/api/authorize?app_key=${clientKey}&redirect_uri=${redirectUri}&state=${state}&scope=${scope}&response_type=code`;
    reply.send({ url });
  });

  // TikTok OAuth callback
  fastify.get('/api/auth/tiktok/callback', async (request, reply) => {
    const { code, state } = request.query;
    if (!code) return reply.code(400).send({ error: 'Missing code' });
    try {
      const res = await fetch('https://auth.tiktok-shops.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_key: process.env.TIKTOK_CLIENT_KEY,
          app_secret: process.env.TIKTOK_CLIENT_SECRET,
          auth_code: code,
          grant_type: 'authorized_code'
        })
      });
      const data = await res.json();
      const userId = state.split('-')[0];
      await db.query(
        'UPDATE users SET tiktok_access_token = $1, tiktok_refresh_token = $2 WHERE id = $3',
        [data.access_token, data.refresh_token, userId]
      );
      reply.send('TikTok connected. You can close this window.');
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ error: 'Failed to exchange code' });
    }
  });

  // TikTok webhook: handle new orders and generate shipping label
  fastify.post('/api/webhooks/tiktok', async (request, reply) => {
    const event = request.body;
    try {
      const sellerEmail = event?.seller_email;
      if (!sellerEmail) {
        return reply.code(400).send({ error: 'Missing seller info' });
      }
      const res = await db.query('SELECT * FROM users WHERE email = $1', [sellerEmail]);
      if (!res.rows.length) return reply.code(404).send({ error: 'Seller not found' });
      const user = res.rows[0];
      if (!user.automation_enabled || !user.packlink_api_key) {
        return reply.send({ status: 'Automation disabled' });
      }
      // Build minimal shipment payload.  In practice, this must include sender, recipient, dimensions, etc.
      const shipmentPayload = {
        /* TODO: fill with actual order data */
      };
      // Create shipment with Packlink
      const plRes = await fetch('https://api.packlink.com/v1/shipments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.packlink_api_key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(shipmentPayload)
      });
      const plData = await plRes.json();
      const trackingNumber = plData.tracking_number || 'TRACK';
      // Notify TikTok of shipment
      await fetch('https://open-api.tiktokglobalshop.com/api/logistics/ship', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': user.tiktok_access_token
        },
        body: JSON.stringify({
          order_id: event.order_id,
          tracking_number: trackingNumber,
          carrier_code: 'Packlink',
          service: 'standard'
        })
      });
      // Report metered usage to Stripe
      if (stripe && user.stripe_subscription_item_id) {
        await stripe.subscriptionItems.createUsageRecord(user.stripe_subscription_item_id, {
          quantity: 1,
          timestamp: Math.floor(Date.now() / 1000),
          action: 'increment'
        });
      }
      reply.send({ status: 'Label generated', tracking: trackingNumber });
    } catch (err) {
      fastify.log.error(err);
      reply.code(500).send({ error: 'Failed to process webhook' });
    }
  });

  // Start server
  const port = process.env.PORT || 3000;
  fastify.listen({ port, host: '0.0.0.0' }, (err, address) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    fastify.log.info(`API listening on ${address}`);
  });
}

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
