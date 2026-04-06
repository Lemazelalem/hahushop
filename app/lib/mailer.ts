// lib/mailer.ts — Server-side email sender using Namecheap Private Email SMTP
// NEVER import from client components — server-side only (API routes)
import nodemailer from "nodemailer";

let _transporter: nodemailer.Transporter | null = null;

export function getMailer(): nodemailer.Transporter {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST || "mail.privateemail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";

  if (!user || !pass) {
    throw new Error("SMTP_USER and SMTP_PASS must be set in .env.local");
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return _transporter;
}

export const SENDER_ADDRESS =
  process.env.SMTP_FROM || "HahuShop <customer.support@hahushop.com>";
