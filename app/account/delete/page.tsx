// app/account/delete/page.tsx
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete Account – HahuShop",
  description: "Request deletion of your HahuShop account and associated data.",
};

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-16 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8 space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Delete Your Account</h1>

        <p className="text-slate-600">
          We&apos;re sorry to see you go. If you&apos;d like to permanently delete your HahuShop
          account and all associated data, please follow the steps below.
        </p>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">How to request account deletion</h2>
          <ol className="list-decimal list-inside space-y-2 text-slate-600">
            <li>Send an email to <a href="mailto:customer.support@hahushop.com" className="text-lime-700 underline font-medium">customer.support@hahushop.com</a></li>
            <li>Use the subject line: <strong>Account Deletion Request</strong></li>
            <li>Include the email address associated with your account</li>
            <li>We will process your request within <strong>7 business days</strong></li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">What data will be deleted</h2>
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>Your profile information (name, phone number, address)</li>
            <li>Your account credentials and login data</li>
            <li>Any saved addresses</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-800">What data may be retained</h2>
          <p className="text-slate-600">
            Order history and transaction records may be retained for up to <strong>7 years</strong> for
            legal, tax, and compliance purposes. This data will not be used for marketing.
          </p>
        </section>

        <div className="pt-4 border-t border-slate-200">
          <a
            href="mailto:customer.support@hahushop.com?subject=Account%20Deletion%20Request"
            className="inline-block bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Send Deletion Request
          </a>
        </div>

        <p className="text-sm text-slate-400">
          If you have questions, contact us at{" "}
          <a href="mailto:customer.support@hahushop.com" className="underline">
            customer.support@hahushop.com
          </a>
        </p>

        <Link href="/" className="block text-sm text-slate-400 underline">
          ← Back to HahuShop
        </Link>
      </div>
    </main>
  );
}
