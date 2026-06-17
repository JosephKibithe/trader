<div align="center">
  <h1>📈 Groq Trader MVP</h1>
  <p><strong>A blazingly fast, concise AI assistant for the stock and crypto markets.</strong></p>
  
  <p>
    <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js" />
    <img src="https://img.shields.io/badge/Groq-Llama%_3-f36e21?style=for-the-badge" alt="Groq" />
    <img src="https://img.shields.io/badge/Cloudflare-Deployed-f38020?style=for-the-badge&logo=cloudflare" alt="Cloudflare" />
    <img src="https://img.shields.io/badge/Upstash-Redis-00e699?style=for-the-badge" alt="Upstash Redis" />
  </p>
</div>

---

## ✨ Overview

**Groq Trader MVP** is a robust, production-ready web application built to provide quick, low-hype answers to market-related questions. Leveraging **Groq's Llama-3.1-8b-instant** model, it delivers near-instantaneous responses. 

The architecture is built for the edge, deployed seamlessly on **Cloudflare** via OpenNext, and secured using robust rate limiting, captchas, and authentication mechanisms.

---

## 🚀 Features

- ⚡ **Ultra-Fast Inference:** Powered by Groq's Llama 3 models for sub-second responses.
- 🛡️ **Bot Protection:** Integrated with **Cloudflare Turnstile** to ensure anonymous traffic is human.
- 🚦 **Robust Rate Limiting:** IP-based rate limiting using **Upstash Redis** to prevent API abuse.
- 🔐 **Tiered Usage Limits:** 
  - **Anonymous users:** Have a strict message limit.
  - **Signed-in users:** Authenticated seamlessly via **Google (NextAuth)** to unlock higher limits.
- ☁️ **Edge Deployment:** Configured for Cloudflare Workers/Pages via `@opennextjs/cloudflare`.

---

## 🛠️ Tech Stack

| Category | Technology |
| :--- | :--- |
| **Framework** | Next.js 16 (App Router), React 19 |
| **Styling** | Tailwind CSS v4 |
| **AI / LLM** | Groq API (`llama-3.1-8b-instant`) |
| **Database/Cache** | Upstash Redis |
| **Authentication**| NextAuth.js (Google Provider) |
| **Security** | Cloudflare Turnstile |
| **Deployment** | OpenNext, Cloudflare Wrangler |

---

## ⚙️ Getting Started

### 1. Prerequisites

Ensure you have Node.js (v20+) installed. You will also need accounts with:
- [Groq](https://console.groq.com/) (For the API key)
- [Upstash](https://upstash.com/) (For a Redis database)
- [Google Cloud Console](https://console.cloud.google.com/) (For NextAuth OAuth credentials)
- [Cloudflare](https://dash.cloudflare.com/) (For Turnstile and deployment)

### 2. Environment Variables

Create a `.env.local` file in the root directory by copying the example file:

```bash
cp .env.example .env.local
```

Fill in the required variables:
```env
# Groq
GROQ_API_KEY="your_groq_api_key"

# Upstash Redis
UPSTASH_REDIS_REST_URL="your_upstash_url"
UPSTASH_REDIS_REST_TOKEN="your_upstash_token"

# Authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your_nextauth_secret" # Generate with `openssl rand -base64 32`
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY="your_turnstile_site_key"
TURNSTILE_SECRET_KEY="your_turnstile_secret_key"
```

### 3. Installation

Install the dependencies using `npm`:

```bash
npm install
```

### 4. Running Locally

Start the Next.js development server:

```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to interact with the MVP!

---

## ☁️ Deployment

This project uses [OpenNext](https://opennext.js.org/cloudflare) to compile the Next.js app for Cloudflare's Edge.

To deploy to Cloudflare, simply run:

```bash
npm run deploy
```

This command uses `opennextjs-cloudflare build` and `wrangler` under the hood to bundle and publish your app. Ensure you have authenticated with Wrangler (`npx wrangler login`) beforehand.

---

> Built with ❤️ by JosephKibithe
