export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        backgroundColor: "#0F1115",
        color: "#E8E4E0",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div style={{ marginBottom: "24px" }}>
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "#6B4E7C" }}
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
          <circle cx="12" cy="12" r="10" strokeDasharray="4 4" />
        </svg>
      </div>
      <h1
        style={{
          fontSize: "24px",
          fontWeight: 600,
          marginBottom: "12px",
          color: "#E8E4E0",
        }}
      >
        You are offline
      </h1>
      <p
        style={{
          fontSize: "16px",
          lineHeight: 1.5,
          color: "#9B96A3",
          maxWidth: "280px",
        }}
      >
        Please check your internet connection and try again.
      </p>
      <a
        href="/"
        style={{
          marginTop: "32px",
          padding: "12px 24px",
          backgroundColor: "#6B4E7C",
          color: "#FFFFFF",
          border: "none",
          borderRadius: "8px",
          fontSize: "16px",
          fontWeight: 500,
          cursor: "pointer",
          textDecoration: "none",
          display: "inline-block",
        }}
      >
        Try again
      </a>
    </div>
  );
}
