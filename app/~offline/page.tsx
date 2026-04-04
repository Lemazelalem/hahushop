export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">📡</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">You're offline</h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          It looks like you've lost your internet connection. Please check your
          network and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
