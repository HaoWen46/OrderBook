import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-800 text-slate-100">
      <h1 className="text-6xl font-extrabold tracking-tight">404</h1>
      <p className="mt-4 text-xl">Oops — that page doesn’t exist.</p>
      <Link
        to="/"
        className="mt-8 rounded-lg bg-indigo-500 px-5 py-2 text-lg font-semibold hover:bg-indigo-600"
      >
        Back to Home
      </Link>
    </div>
  );
}
