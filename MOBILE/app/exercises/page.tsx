export default function ExercisesPage() {
  return (
    <main className="px-6 pt-8 pb-12">
      <h1
        className="text-2xl leading-tight font-medium tracking-[-0.01em] text-vella-text"
        style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
      >
        Exercises
      </h1>

      <div className="mt-6 space-y-6">
        <section>
          <p className="text-xs tracking-[0.12em] uppercase text-vella-muted">Mind</p>
        </section>
        <section>
          <p className="text-xs tracking-[0.12em] uppercase text-vella-muted">Body</p>
        </section>
      </div>
    </main>
  );
}

