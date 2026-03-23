// app/contact/page.tsx

"use client";

import { FormEvent, useState } from "react";

export default function ContactPage() {
  const [status, setStatus] = useState<"idle" | "sent">("idle");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sent");
    // In a real app, you'd send this to an API or email service here.
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-10">
      {/* Background layers (same as other pages) */}
      <div className="bg-scene" />
      <div className="bg-vignette" />
      <div className="sparkles" />

      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <section className="glass glass-card glow-blue rounded-[24px] glass-ring p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
                Contact Us
              </h1>
              <p className="mt-2 text-slate-700 max-w-xl">
                Have a question about the lemon + blue shop concept, layout, or
                features? This form is a demo, but it shows how a real contact
                flow would look.
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end text-xs text-slate-700">
              <span className="pill px-3 py-1 mb-1 font-semibold text-slate-900">
                Demo
              </span>
              <span>Form does not send real emails yet.</span>
              <span>Later, it can connect to an API endpoint.</span>
            </div>
          </div>
        </section>

        {/* Form */}
        <section className="mt-6">
          <div className="glass glass-card glow-green rounded-[24px] glass-ring p-6 md:p-8">
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-800">
                    Name
                  </label>
                  <div className="glass glass-card rounded-[16px] p-2 glass-ring bg-white/40">
                    <input
                      type="text"
                      className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                      placeholder="Your name"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-800">
                    Email
                  </label>
                  <div className="glass glass-card rounded-[16px] p-2 glass-ring bg-white/40">
                    <input
                      type="email"
                      className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-800">
                  Subject
                </label>
                <div className="glass glass-card rounded-[16px] p-2 glass-ring bg-white/40">
                  <input
                    type="text"
                    className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                    placeholder="How can we help?"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-800">
                  Message
                </label>
                <div className="glass glass-card rounded-[18px] p-2 glass-ring bg-white/40">
                  <textarea
                    className="min-h-[120px] w-full resize-none bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
                    placeholder="Share a bit more detail about your question or idea..."
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-center">
                <div className="text-[11px] text-slate-700">
                  By sending this message, you&apos;re testing the layout only.
                  Later, this can store messages in a database or send emails
                  via a backend.
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="pill rounded-full px-4 py-2 text-xs font-semibold text-slate-900"
                    onClick={() => setStatus("idle")}
                  >
                    Reset
                  </button>
                  <button
                    type="submit"
                    className="btn-cta rounded-full px-6 py-2.5 text-sm font-semibold text-slate-900"
                  >
                    {status === "sent" ? "Sent (demo)" : "Send Message"}
                  </button>
                </div>
              </div>

              {status === "sent" && (
                <div className="mt-2 text-[11px] text-emerald-700">
                  Message “sent” (demo). In a real app, this would confirm a
                  successful API call.
                </div>
              )}
            </form>
          </div>
        </section>

        <footer className="mt-8 pb-8 text-center text-xs text-slate-700">
          Contact form is demo-only. Later, we can hook it up to Next.js API
          routes or a third-party email service.
        </footer>
      </div>
    </main>
  );
}
