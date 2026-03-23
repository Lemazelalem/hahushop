"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useMiniCart } from "@/components/MiniCartProvider";

export default function ClientCartLink() {
  const { itemCount, isLoaded } = useMiniCart();
  const count = isLoaded ? itemCount : 0;

  return (
    <Link
      href="/checkout"
      className="flex items-end gap-1 hover:outline hover:outline-1 hover:outline-white/30 rounded-sm p-2 transition-all relative"
    >
      <div className="relative">
        <ShoppingCart className="w-8 h-8" />
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-orange-400 to-rose-500 rounded-full flex items-center justify-center text-xs font-bold text-slate-900">
          {count > 99 ? "99+" : count}
        </span>
      </div>
      <span className="hidden md:block text-sm font-bold mb-1">Cart</span>
    </Link>
  );
}
