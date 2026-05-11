import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - HahuShop",
  description: "HahuShop privacy policy — how we collect, use, and protect your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-8"
        >
          ← Back to HahuShop
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-slate-500 mb-10">
          Effective date: April 4, 2026 &middot; Last updated: April 4, 2026
        </p>

        <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed text-[15px]">
          <section>
            <h2 className="text-xl font-bold text-slate-900">1. Introduction</h2>
            <p>
              HahuShop (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the
              HahuShop marketplace accessible at{" "}
              <span className="font-medium">hahushop.et</span> and through our mobile
              application. This Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you use our platform.
            </p>
            <p>
              By accessing or using HahuShop, you agree to this Privacy Policy. If you do not
              agree, please discontinue use of our services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">2. Information We Collect</h2>
            <h3 className="text-lg font-semibold text-slate-800 mt-4">2.1 Information You Provide</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Account registration details: name, email address, phone number, and password.</li>
              <li>Seller information: store name, bank account details for payouts, business address.</li>
              <li>Public employee verification: employer details submitted during signup.</li>
              <li>Order and payment information: shipping address, order history, and payment method details.</li>
              <li>Communications: messages sent to our support team or through the platform.</li>
            </ul>

            <h3 className="text-lg font-semibold text-slate-800 mt-4">2.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Device information: device type, operating system, browser type.</li>
              <li>Usage data: pages visited, features used, time spent on the platform.</li>
              <li>Log data: IP address, access times, and referring URLs.</li>
              <li>Cookies and local storage: used for authentication, cart persistence, and preferences.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To create and manage your account.</li>
              <li>To process orders, payments, and deliveries.</li>
              <li>To facilitate seller payouts to Ethiopian bank accounts.</li>
              <li>To verify public employee eligibility for exclusive pricing.</li>
              <li>To send order confirmations, shipping updates, and service notifications.</li>
              <li>To improve our platform, features, and user experience.</li>
              <li>To detect, prevent, and address fraud or security issues.</li>
              <li>To comply with legal obligations under Ethiopian law.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">4. Information Sharing</h2>
            <p>We do not sell your personal information. We may share your data with:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Sellers:</strong> Name, shipping address, and order details to fulfill your
                purchases.
              </li>
              <li>
                <strong>Payment processors:</strong> Payment details necessary to process
                transactions securely.
              </li>
              <li>
                <strong>Delivery partners:</strong> Shipping address and contact information for
                order delivery.
              </li>
              <li>
                <strong>Service providers:</strong> Hosting (Vercel), database (Supabase), and
                analytics services that help us operate.
              </li>
              <li>
                <strong>Legal authorities:</strong> When required by law, court order, or to protect
                our rights and safety.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">5. Data Storage and Security</h2>
            <p>
              Your data is stored securely using Supabase (PostgreSQL) with row-level security
              policies. We use HTTPS encryption for all data in transit: All passwords are hashed
              and never stored in plain text. We implement access controls so users can only view
              their own data.
            </p>
            <p>
              While we take reasonable measures to protect your information, no method of
              electronic transmission or storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">6. Cookies and Local Storage</h2>
            <p>
              We use cookies and browser local storage for authentication sessions, shopping cart
              persistence, and user preferences. You can configure your browser to refuse cookies,
              but this may limit platform functionality.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate information.</li>
              <li>Request deletion of your account and associated data.</li>
              <li>Withdraw consent for marketing communications at any time.</li>
              <li>Request a copy of your data in a portable format.</li>
            </ul>
            <p>
              To exercise these rights, contact us at{" "}
              <a href="mailto:customer.support@hahushop.com" className="text-lime-700 underline">
                customer.support@hahushop.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">8. Children&apos;s Privacy</h2>
            <p>
              HahuShop is not intended for children under 13. We do not knowingly collect
              personal information from children. If you believe a child has provided us with
              personal data, please contact us and we will promptly delete it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">9. Third-Party Links</h2>
            <p>
              Our platform may contain links to third-party websites. We are not responsible for
              the privacy practices of those sites. We encourage you to read their privacy
              policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Changes will be posted on this
              page with an updated &ldquo;Last updated&rdquo; date. Continued use of HahuShop
              after changes constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">11. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or our data practices, contact us:
            </p>
            <ul className="list-none space-y-1">
              <li><strong>Email:</strong>{" "}
                <a href="mailto:customer.support@hahushop.com" className="text-lime-700 underline">
                  customer.support@hahushop.com
                </a>
              </li>
              <li><strong>Business inquiries:</strong>{"\ "}
                <a href="mailto:customer.support@hahushop.com" className="text-lime-700 underline">
                  customer.support@hahushop.com
                </a>
              </li>
              <li><strong>Location:</strong> Addis Ababa, Ethiopia</li>
            </ul>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-200 text-center text-xs text-slate-400">
          &copy; {new Date().getFullYear()} HahuShop. All rights reserved.
        </div>
      </div>
    </main>
  );
}
