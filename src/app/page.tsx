import { LandingPage } from "@/components/landing/LandingPage";

// `/` is the canonical home. Middleware (proxy.ts) redirects logged-in users to
// /productions, so this page only renders for logged-out visitors.
export default function Home() {
  return <LandingPage />;
}
