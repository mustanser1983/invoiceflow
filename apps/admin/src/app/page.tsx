// Sprint 0 placeholder. Admin sign-in with MFA arrives in Sprint 9 (S9-1, ADR-0002).
export default function AdminHome() {
  return (
    <main className="shell">
      <section className="card" aria-labelledby="title">
        <p className="eyebrow">Invoiceflow</p>
        <h1 id="title">Platform administration</h1>
        <p className="muted">
          Sign-in for Super Admins is not available yet. It will use a separate, MFA-protected
          account.
        </p>
        <button type="button" disabled>
          Sign in
        </button>
      </section>
    </main>
  );
}
