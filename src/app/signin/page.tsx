"use client";

import { signIn } from "next-auth/react";

export default function SignInPage() {
  return (
    <main className="flex flex-col items-center justify-center h-screen gap-6">
      <h1 className="text-3xl font-bold">Welcome Back 👋</h1>
      <p className="text-gray-600">Sign in with your Google account</p>

      <button
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
      >
        Sign in with Google
      </button>
    </main>
  );
}
