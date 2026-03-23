import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-black bg-gradient-to-r from-lime-400 to-green-500 bg-clip-text text-transparent mb-4">
          404
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Page not found</h2>
        <p className="text-gray-500 mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center px-6 py-3 rounded-full bg-gradient-to-r from-lime-400 to-green-500 text-white font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-105"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
