# Hahushop

A multi-sided marketplace built from scratch. Buyers browse and purchase, sellers manage their storefronts and orders, and admins handle verification and platform operations.

🔗 **Live:** [hahushop.vercel.app](https://hahushop.vercel.app)

## What's inside

- Storefront browsing and product pages
- Seller dashboards with inventory and order management
- Buyer checkout with Stripe payments
- Seller onboarding and verification workflow
- Admin tooling for platform management
- Supabase Auth with row-level security across all user roles
- Real-time cart persistence and mobile-first UI
- PWA support

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14, React, TypeScript, Tailwind CSS |
| Backend | Supabase, PostgreSQL, Row-Level Security |
| Payments | Stripe (checkout, webhooks, payouts) |
| Deployment | Vercel |

## Run locally

```bash
git clone https://github.com/Lemazelalem/hahushop.git
cd hahushop
npm install
# Add your .env.local (Supabase + Stripe keys)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)
