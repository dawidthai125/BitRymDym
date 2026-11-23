import { LandingPageView, landingMetadata } from "@/components/seo/landing-page-view";

const SLUG = "program-do-nagrywania-rapu";

export function generateMetadata() {
  return landingMetadata(SLUG);
}

export default function Page() {
  return <LandingPageView slug={SLUG} />;
}
