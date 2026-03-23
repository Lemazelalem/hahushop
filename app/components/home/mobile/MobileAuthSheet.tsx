"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  userInitial: string | null;
  userName: string | null;
  userEmail: string | null;
  onLogout: () => Promise<void>;
};

export default function MobileAuthSheet({
  open,
  onClose,
  userInitial,
  userName,
  userEmail,
  onLogout,
}: Props) {
  const router = useRouter();
  const isLoggedIn = !!userInitial;

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl transition-transform duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 bg-slate-200 rounded-full" />
        </div>

        <button
          onClick={onClose}
          className="absolute top-3 right-4 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-6 pb-10 pt-3">
          {isLoggedIn ? (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-blue-600/25">
                {userInitial}
              </div>
              <p className="text-lg font-black text-slate-900 tracking-tight">{userName}</p>
              {userEmail && <p className="text-xs text-slate-500 mt-0.5 mb-5">{userEmail}</p>}

              <button
                onClick={() => {
                  onClose();
                  router.push("/account");
                }}
                className="w-full py-3.5 bg-slate-900 text-white text-sm font-bold rounded-lg mb-3 hover:bg-slate-800 transition-colors"
              >
                Go to My Account
              </button>

              <button
                onClick={async() => {
                 await onLogout();
                  onClose();
                }}
                className="w-full py-3 text-sm font-bold text-rose-500 border border-rose-100 rounded-lg hover:bg-rose-50 transition-colors"
              >
                Log out
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-[22px] font-black text-slate-900 tracking-tight mb-1">
                Welcome back 👋
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                Log in to track orders, save wishlist &amp; more.
              </p>

              <button
                onClick={() => {
                  onClose();
                  router.push("/auth/login");
                }}
                className="w-full py-3.5 bg-slate-900 text-white text-sm font-bold rounded-lg mb-3 hover:bg-slate-800 transition-colors"
              >
                Log in
              </button>

              <button
                onClick={() => {
                  onClose();
                  router.push("/auth/signup");
                }}
                className="w-full py-3.5 bg-white text-slate-900 text-sm font-bold rounded-lg border-[1.5px] border-slate-900 mb-5 hover:bg-slate-50 transition-colors"
              >
                Create an account
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}