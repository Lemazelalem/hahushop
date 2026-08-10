-- Add delivery_cents column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_cents integer NOT NULL DEFAULT 0;
