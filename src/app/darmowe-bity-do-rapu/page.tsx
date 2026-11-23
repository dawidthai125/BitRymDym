import { LandingPageView, landingMetadata } from "@/components/seo/landing-page-view";

const SLUG = "darmowe-bity-do-rapu";

export function generateMetadata() {
  return landingMetadata(SLUG);
}

export default function Page() {
  return <LandingPageView slug={SLUG} />;
}
