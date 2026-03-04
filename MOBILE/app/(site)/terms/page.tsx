"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
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
          <h1 className="text-xl font-semibold text-stone-700">Terms of Service</h1>
        </header>

        <div className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm space-y-4 text-sm text-neutral-700 leading-relaxed">
          <p className="text-xs text-neutral-400">Last updated: March 2026</p>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">1. Acceptance of Terms</h2>
            <p>
              By using Vella, you agree to these terms of service. Vella is a personal AI assistant
              designed to help with clarity, direction, and self-alignment. Use of the app constitutes
              acceptance of these terms.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">2. Service Description</h2>
            <p>
              Vella provides AI-powered conversations, journaling, check-ins, and personal insight
              tools. The AI is powered by OpenAI and is intended for personal reflection and
              productivity — it is not a substitute for professional medical, legal, or financial advice.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">3. User Responsibilities</h2>
            <p>
              You are responsible for the content you share with Vella. Do not use the service
              for illegal activities, harassment, or to generate harmful content. You must be at least
              13 years old to use Vella.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">4. AI Limitations</h2>
            <p>
              Vella&apos;s AI responses are generated algorithmically and may not always be accurate or
              appropriate. The AI does not have access to real-time information and should not be relied
              upon for emergency situations, medical diagnoses, or critical decisions.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">5. Subscriptions &amp; Payments</h2>
            <p>
              Vella offers free and paid plans. Paid subscriptions are processed through Stripe.
              You may cancel your subscription at any time. Refunds are handled according to the
              applicable app store or payment provider policies.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">6. Data &amp; Privacy</h2>
            <p>
              Your privacy is important to us. Please refer to our{" "}
              <a href="/privacy" className="text-sky-600 underline">Privacy Policy</a>{" "}
              for details on how your data is collected, used, and protected.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">7. Intellectual Property</h2>
            <p>
              The Vella name, logo, and app design are proprietary. Content you create within Vella
              (journals, notes, etc.) belongs to you. AI-generated responses are provided for your
              personal use.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">8. Limitation of Liability</h2>
            <p>
              Vella is provided &quot;as is&quot; without warranties of any kind. We are not liable for any
              damages arising from your use of the service, including but not limited to decisions
              made based on AI responses.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-neutral-900 mb-1">9. Changes to Terms</h2>
            <p>
              We may update these terms from time to time. Continued use of Vella after changes
              constitutes acceptance of the updated terms.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
