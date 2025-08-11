README.md# SaaS TikTok Shop → Packlink Connector

This repository contains a full-stack SaaS application that connects TikTok Shop orders to a Packlink PRO account, automatically generates shipping labels, and reports tracking information back to TikTok.  The platform includes:

* A **Next.js** web application (`web/`) with pages for user sign‑up and login, onboarding to collect API credentials, toggling automation on/off, and a billing dashboard.
* A **Fastify** API server (`api/`) that implements OAuth for TikTok, communicates with the Packlink PRO API to quote and create shipments, returns label PDFs, and records usage events with Stripe.
* **Stripe** integration for both subscription billing and metered usage billing (each generated label records a usage unit).

## Features

* **User authentication** with email/password and JSON Web Tokens (JWT).
* **Multi‑tenant** support.  Each account holds its own API keys and billing subscription.
* **Onboarding workflow** for connecting a TikTok Shop and a Packlink PRO account.  Users can enable or disable the automation at any time.
* **Webhook** endpoint that receives TikTok order notifications, selects a shipping service based on saved rules, calls the Packlink API to generate a label, stores the label URL, and updates TikTok with the tracking number.
* **Stripe billing** with a fixed monthly subscription and a metered component that increments for each generated shipping label.

## Structure

```
saas-project/
  api/         # Fastify API server
  web/         # Next.js web client
  render.yaml  # Render deployment configuration
```

### `api/`

The API server exposes endpoints for user authentication, onboarding (saving API keys), and webhooks.  It connects to a PostgreSQL database (configured via `DATABASE_URL`) and uses Redis for job queueing (optional).  Sensitive keys (TikTok client ID/secret, Packlink API key, Stripe keys) are loaded from environment variables.

To run the API locally:

```sh
cd api
npm install
node index.js
```

### `web/`

The frontend is a Next.js 14 application using the `pages/` router for simplicity.  It contains pages for sign up, login, dashboard, setup, and billing.  The React app communicates with the API server via the `/api` endpoints defined in the Fastify app.  Local state is stored with `localStorage`.

To run the web app locally:

```sh
cd web
npm install
npm run dev
```

## Deployment

The included `render.yaml` file defines two services (web and API) and a managed PostgreSQL database.  To deploy on [Render](https://render.com):

1. Create a new Git repository from this project and push it to your GitHub account.
2. In your Render dashboard, click **New → Blueprint** and select the repository containing this code.
3. Render will detect the `render.yaml` file and provision the resources automatically.  You will be prompted to supply environment variables for TikTok, Packlink, Stripe, and JWT secrets.
4. After deployment, open the web service URL to sign up and connect your TikTok and Packlink accounts.

## Important Environment Variables

The following environment variables must be defined either locally in a `.env` file or in the Render dashboard:

* `DATABASE_URL` – PostgreSQL connection string
* `JWT_SECRET` – secret used to sign JWTs
* `TIKTOK_CLIENT_KEY` – TikTok Shop Open Platform client ID
* `TIKTOK_CLIENT_SECRET` – TikTok Shop Open Platform client secret
* `TIKTOK_REDIRECT_URI` – OAuth callback URL pointing to your API service
* `PACKLINK_API_KEY` – Packlink PRO API key
* `STRIPE_SECRET_KEY` – Stripe secret key used by the API
* `STRIPE_PUBLISHABLE_KEY` – Stripe public key used by the web app
* `STRIPE_PRICE_ID` – Stripe price ID for the subscription
* `STRIPE_METERED_PRICE_ID` – Stripe price ID for the metered usage component

This project is intended as a starting point.  Further improvements – such as stronger session handling, custom domain configuration, and advanced dashboard features – can be built on top of this foundation.
