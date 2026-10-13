import customer from "../fixtures/customers/lifecycle-customer.json";

/** Public identity is sourced; the demo never claims to describe actual banking activity. */
export default function DemoCustomerContext() {
  return <p className="rx-muted">
    Chuck Robbins is Cisco’s Chair and CEO. <a href={customer.public_profile.source_url} target="_blank" rel="noreferrer">Cisco biography</a>
    {" · "}The banking relationship, portfolio, screening results, and incidents in this demo are hypothetical.
  </p>;
}
