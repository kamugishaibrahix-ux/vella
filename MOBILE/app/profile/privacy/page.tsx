"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Shield, Lock, Eye, Database, Server, Trash2 } from "lucide-react";

// Components
function InfoCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4 bg-neutral-50 rounded-xl border border-neutral-100">
      <div className="w-9 h-9 rounded-lg bg-white border border-neutral-200 flex items-center justify-center text-neutral-600 shrink-0 shadow-sm">
        {icon}
      </div>
      <div>
        <h3 className="font-medium text-neutral-900">{title}</h3>
        <p className="text-sm text-neutral-500 mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function DataRow({
  label,
  value,
  sensitive = false,
}: {
  label: string;
  value: string;
  sensitive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-neutral-100 last:border-0">
      <span className="text-neutral-600">{label}</span>
      <span className={sensitive ? "text-neutral-900 font-mono" : "text-neutral-900"}>
        {value}
      </span>
    </div>
  );
}

// Main Page
export default function PrivacyPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [localDataSize, setLocalDataSize] = useState<string>("0 KB");

  useEffect(() => {
    setMounted(true);

    // Estimate local data size
    try {
      let size = 0;
      const namespace = "vella_local_v1";
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(namespace)) {
          const value = localStorage.getItem(key) || "";
          size += key.length + value.length;
        }
      }
      // Convert to human readable
      const bytes = size * 2; // rough estimate (UTF-16)
      if (bytes < 1024) {
        setLocalDataSize(`${bytes} B`);
      } else if (bytes < 1024 * 1024) {
        setLocalDataSize(`${(bytes / 1024).toFixed(1)} KB`);
      } else {
        setLocalDataSize(`${(bytes / (1024 * 1024)).toFixed(1)} MB`);
      }
    } catch {
      setLocalDataSize("Unknown");
    }
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <div className="px-5 py-6">
          <div className="h-8 w-32 bg-neutral-200 rounded animate-pulse mb-6" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-white rounded-xl border border-neutral-200 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="px-5 py-6 space-y-6">
        {/* Header */}
        <header className="flex items-center gap-3">
          <button
            onClick={() => router.push("/profile")}
            className="p-2 -ml-2 rounded-lg hover:bg-neutral-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-700" />
          </button>
          <h1 className="text-xl font-semibold text-neutral-900">Privacy</h1>
        </header>

        {/* Local-First Banner */}
        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-emerald-900">Local-First Design</h2>
              <p className="text-sm text-emerald-700 mt-1 leading-relaxed">
                Your journals, check-ins, and conversations are stored only on this device.
                They never leave your browser unless you explicitly choose to sync.
              </p>
            </div>
          </div>
        </div>

        {/* Privacy Principles */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">
            How We Handle Your Data
          </h2>

          <InfoCard
            icon={<Lock className="w-5 h-5" />}
            title="Encrypted at Rest"
            description="All data stored locally uses your browser's built-in encryption. No one else can access it."
          />

          <InfoCard
            icon={<Eye className="w-5 h-5" />}
            title="No Content in Cloud"
            description="Your personal thoughts, journals, and conversations never touch our servers. Only minimal metadata (like timestamps) is stored."
          />

          <InfoCard
            icon={<Server className="w-5 h-5" />}
            title="Minimal Metadata"
            description="We store only what's necessary: your anonymous ID, plan tier, and token usage. No content, no conversations."
          />

          <InfoCard
            icon={<Shield className="w-5 h-5" />}
            title="You Control Everything"
            description="Export your data anytime. Delete everything with one tap. Your data, your device, your choice."
          />
        </section>

        {/* Data Summary */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">
            Your Data on This Device
          </h2>

          <DataRow label="Storage Used" value={localDataSize} />
          <DataRow label="Location" value="Browser LocalStorage" />
          <DataRow label="Encryption" value="AES-256 (Browser Native)" />
          <DataRow label="Sync Status" value="Not synced" />
        </section>

        {/* Data Practices */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">
            What We Don&apos;t Do
          </h2>

          <ul className="space-y-3">
            {[
              "We don't sell your data",
              "We don't train AI on your personal content",
              "We don't share with third parties",
              "We don't track you across the web",
              "We don't store your conversations on our servers",
            ].map((item, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-neutral-600">
                <span className="text-emerald-500 mt-0.5">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Quick Actions */}
        <section className="bg-white rounded-2xl border border-neutral-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-4">
            Privacy Actions
          </h2>

          <div className="space-y-3">
            <button
              onClick={() => router.push("/profile")}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-neutral-50 hover:bg-neutral-100 transition-colors text-left"
            >
              <Database className="w-5 h-5 text-neutral-600" />
              <div>
                <div className="font-medium text-neutral-900">Export Your Data</div>
                <div className="text-sm text-neutral-500">Download everything stored locally</div>
              </div>
            </button>

            <button
              onClick={() => router.push("/profile")}
              className="w-full flex items-center gap-3 p-3 rounded-xl bg-red-50 hover:bg-red-100 transition-colors text-left"
            >
              <Trash2 className="w-5 h-5 text-red-600" />
              <div>
                <div className="font-medium text-red-600">Delete All Data</div>
                <div className="text-sm text-red-500">Permanently remove everything</div>
              </div>
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-neutral-400 pt-4">
          <p>Vella is built on trust. Your privacy is our priority.</p>
          <p className="mt-1">Last updated: February 2025</p>
        </footer>
      </div>
    </div>
  );
}
