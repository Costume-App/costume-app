"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-gray-600">Please try again.</p>
      <button
        onClick={reset}
        className="rounded-lg bg-black px-4 py-2 font-medium text-white"
      >
        Retry
      </button>
    </main>
  );
}
