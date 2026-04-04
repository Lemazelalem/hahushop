import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - HahuShop",
  description: "HahuShop terms of service — rules and conditions for using our marketplace.",
};

export default function TermsOfServicePage() {
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
          Terms of Service
        </h1>
        <p className="text-sm text-slate-500 mb-10">
          Effective date: April 4, 2026 &middot; Last updated: April 4, 2026
        </p>

        <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed text-[15px]">
          <section>
            <h2 className="text-xl font-bold text-slate-900">1. Acceptance of Terms</h2>
            <p>
              By accessing or using HahuShop (&ldquo;the Platform&rdquo;), operated by HahuShop
              (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), you agree to be bound
              by these Terms of Service. If you do not agree, do not use the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">2. About HahuShop</h2>
            <p>
              HahuShop is an online marketplace based in Ethiopia that connects buyers with
              approved sellers. We facilitate product listings, order processing, and payment
              handling. Transactions are conducted in Ethiopian Birr (ETB).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">3. Accounts</h2>
            <h3 className="text-lg font-semibold text-slate-800 mt-4">3.1 Registration</h3>
            <p>
              You must create an account to make purchases or sell on HahuShop. You agree to
              provide accurate, current, and complete information and to keep your account details
              up to date.
            </p>
            <h3 className="text-lg font-semibold text-slate-800 mt-4">3.2 Account Security</h3>
            <p>
              You are responsible for maintaining the confidentiality of your password and for all
              activities under your account. Notify us immediately if you suspect unauthorized
              access.
            </p>
            <h3 className="text-lg font-semibold text-slate-800 mt-4">3.3 Account Termination</h3>
            <p>
              We reserve the right to suspend or terminate accounts that violate these Terms, are
              fraudulent, or are inactive for an extended period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">4. Buyer Terms</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>All prices are displayed in Ethiopian Birr (ETB) and include applicable taxes unless stated otherwise.</li>
              <li>Orders are subject to product availability. Out-of-stock items cannot be added to the cart.</li>
              <li>You are responsible for providing an accurate delivery address.</li>
              <li>Payment must be completed at checkout using the available payment methods.</li>
              <li>Order confirmations will be sent to your registered email address.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">5. Seller Terms</h2>
            <h3 className="text-lg font-semibold text-slate-800 mt-4">5.1 Seller Approval</h3>
            <p>
              Selling on HahuShop requires approval through our seller verification process.
              All sellers must provide valid identification and business information.
            </p>
            <h3 className="text-lg font-semibold text-slate-800 mt-4">5.2 Seller Obligations</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Product listings must be accurate, including descriptions, images, prices, and stock levels.</li>
              <li>Sellers must fulfill orders promptly and maintain adequate stock.</li>
              <li>Sellers must comply with all applicable Ethiopian laws and regulations.</li>
              <li>Misrepresentation of products may result in delisting and account suspension.</li>
            </ul>
            <h3 className="text-lg font-semibold text-slate-800 mt-4">5.3 Payouts</h3>
            <p>
              Seller payouts are processed to the bank account on file. Payout schedules and
              any applicable platform fees will be communicated through the seller dashboard.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">6. Public Employee Program</h2>
            <p>
              Eligible public employees may access exclusive pricing after verification.
              Misrepresentation of employment status will result in account suspension and
              forfeiture of any discounts received.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">7. Prohibited Conduct</h2>
            <p>You may not:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the Platform for any unlawful purpose.</li>
              <li>List or sell counterfeit, stolen, hazardous, or prohibited goods.</li>
              <li>Attempt to circumvent security features or access controls.</li>
              <li>Harass, threaten, or abuse other users or HahuShop staff.</li>
              <li>Create multiple accounts to circumvent suspensions or restrictions.</li>
              <li>Scrape, crawl, or use automated means to access the Platform without permission.</li>
              <li>Manipulate prices, reviews, or ratings.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">8. Returns and Refunds</h2>
            <p>
              Return and refund eligibility depends on the product type and seller policies.
              Defective or misrepresented items are eligible for return within the timeframe
              specified at the time of purchase. Refunds are processed to the original payment
              method.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">9. Intellectual Property</h2>
            <p>
              All content on HahuShop — including logos, design, text, and software — is owned
              by or licensed to HahuShop and protected by intellectual property laws. Sellers
              retain ownership of their product images and descriptions but grant HahuShop a
              license to display them on the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">10. Limitation of Liability</h2>
            <p>
              HahuShop acts as a marketplace facilitator. We do not manufacture, store, or
              directly ship products. To the fullest extent permitted by law:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>We are not liable for product quality, safety, or legality — sellers bear this responsibility.</li>
              <li>We are not liable for indirect, incidental, or consequential damages arising from Platform use.</li>
              <li>Our total liability shall not exceed the amount you paid to HahuShop in the preceding 12 months.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">11. Disclaimer of Warranties</h2>
            <p>
              The Platform is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
              warranties of any kind, express or implied. We do not guarantee uninterrupted or
              error-free service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">12. Governing Law</h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of the
              Federal Democratic Republic of Ethiopia. Any disputes shall be resolved in the
              courts of Addis Ababa, Ethiopia.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">13. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. Material changes will be notified
              via email or a prominent notice on the Platform. Continued use after changes
              constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">14. Contact Us</h2>
            <p>For questions about these Terms of Service:</p>
            <ul className="list-none space-y-1">
              <li><strong>Email:</strong>{" "}
                <a href="mailto:business@hahushop.et" className="text-lime-700 underline">
                  business@hahushop.et
                </a>
              </li>
              <li><strong>Location:</strong> Addis Ababa, Ethiopia</li>
            </ul>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-200 flex justify-center gap-4 text-xs text-slate-400">
          <Link href="/privacy" className="hover:text-slate-600 underline">
            Privacy Policy
          </Link>
          <span>&middot;</span>
          <span>&copy; {new Date().getFullYear()} HahuShop. All rights reserved.</span>
        </div>
      </div>
    </main>
  );
}
