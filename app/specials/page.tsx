"use client";

import { useRouter } from "next/navigation";
import { Briefcase, BadgePercent, ChevronRight } from "lucide-react";

export default function SpecialsPage() {
  const router = useRouter();

  const specials = [
    {
      id: "business",
      title: "Hahu Business",
      subtitle: "Bulk purchasing for companies and organizations",
      icon: Briefcase,
      href: "/business",
      iconWrap: "bg-cyan-100 text-cyan-700",
      accent: "from-cyan-400/30 via-emerald-300/25 to-transparent",
    },
    {
      id: "pe",
      title: "Public Employee",
      subtitle: "ይገባዎታል! ልዩ ቅናሽ ይጠቀሙ",
      icon: BadgePercent,
      href: "/public-employee",
      iconWrap: "bg-emerald-100 text-emerald-700",
      accent: "from-emerald-400/30 via-lime-300/25 to-transparent",
    },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      {/* Mobile Layout - Glassy Green */}
      <div className="md:hidden relative z-10">
        <div className="bg-scene" />
        <div className="bg-vignette" />
        <div className="sparkles" />

        <div className="px-4 pt-6 pb-4">
          <div className="glass glass-card glow-green rounded-[24px] glass-ring p-5">
            <div className="text-[11px] uppercase tracking-wide font-bold text-emerald-700">
              Programs
            </div>
            <h1 className="text-2xl font-black text-slate-900 mt-1">Special Programs</h1>
            <p className="text-sm text-slate-700 mt-2 leading-relaxed">
              
            </p>
          </div>
        </div>

        <div className="px-4 space-y-3 pb-32">
          {specials.map((item) => {
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                onClick={() => router.push(item.href)}
                className="group relative w-full overflow-hidden rounded-[22px] glass glass-card glass-ring p-4 text-left transition-all duration-200 active:scale-[0.99]"
              >
                <div className={`absolute inset-0 bg-gradient-to-r ${item.accent}`} />

                <div className="relative z-10 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${item.iconWrap}`}>
                      <Icon className="w-5 h-5" strokeWidth={1.7} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-base font-bold text-slate-900 truncate">{item.title}</div>
                      <div className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    className="w-5 h-5 text-slate-500 transition-transform duration-200 group-hover:translate-x-0.5"
                    strokeWidth={1.7}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop Layout - Unchanged */}
      <div className="hidden md:block max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-slate-900">Specials</h1>
          <p className="text-slate-500 mt-2">
            Special programs and exclusive offers
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => router.push("/business")}
            className="w-full bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between hover:shadow-md transition"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-blue-100 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-blue-600" />
              </div>

              <div className="text-left">
                <div className="text-lg font-bold text-slate-900">
                  Hahu Business
                </div>
                <div className="text-sm text-slate-500">
                  Bulk purchasing for companies and organizations
                </div>
              </div>
            </div>

            <div className="text-blue-600 font-bold text-sm">Open →</div>
          </button>

          <button
            onClick={() => router.push("/public-employee")}
            className="w-full bg-white rounded-xl border border-slate-200 p-5 flex items-center justify-between hover:shadow-md transition"
          >
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-lg bg-emerald-100 flex items-center justify-center">
                <BadgePercent className="w-5 h-5 text-emerald-600" />
              </div>

              <div className="text-left">
                <div className="text-lg font-bold text-slate-900">
                  Public Employee Deals
                </div>
                <div className="text-sm text-slate-500">
                  Exclusive discounts for government employees
                </div>
              </div>
            </div>

            <div className="text-blue-600 font-bold text-sm">Open →</div>
          </button>
        </div>
      </div>
    </div>
  );
}