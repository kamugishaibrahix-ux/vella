"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="px-5 py-6 space-y-6 max-w-lg mx-auto">
        <header className="flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="p-1 rounded-full hover:bg-neutral-200/50 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-700" />
          </button>
          <h1 className="text-xl font-semibold text-stone-700">Privacy Policy</h1>
        </header>

        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm space-y-4 text-sm text-neutral-700 leading-relaxed">
          <p className="text-xs text-neutral-400">Last updated: March 2026</p>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">1. Data Collection</h2>
            <p>
              Vella is designed with a local-first architecture. Your journals, check-ins, sessions,
              and personal preferences are stored on your device using localStorage. We do not collect
              or store your personal data on our servers unless you explicitly opt in.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">2. AI Processing</h2>
            <p>
              When you use Vella&apos;s chat or voice features, your messages are sent to OpenAI&apos;s API
              for processing. These messages are used solely to generate responses and are not stored
              by Vella after the session ends. OpenAI&apos;s data usage policies apply to API interactions.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">3. Data Storage</h2>
            <p>
              All user data is stored locally on your device. If you choose to create an account,
              minimal account information (email, subscription status) is stored securely in our
              database. Conversation content is never persisted server-side.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">4. Data Sharing</h2>
            <p>
              We do not sell, trade, or share your personal data with third parties. The only external
              service that processes your data is OpenAI, strictly for generating AI responses.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">5. Your Rights</h2>
            <p>
              You have the right to export all your data at any time from the Profile page. You can
              also permanently delete all data stored on your device. Since data is local-first,
              deleting it from your device removes it completely.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">6. Cookies &amp; Tracking</h2>
            <p>
              Vella does not use cookies for tracking. We do not use analytics or advertising trackers.
              The only browser storage used is localStorage for your app data and preferences.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">7. Contact</h2>
            <p>
              If you have questions about this privacy policy, please contact us through the app&apos;s
              feedback channels.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
