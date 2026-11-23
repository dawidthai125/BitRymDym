import { EnglishLandingPageView, englishLandingMetadata } from "@/components/seo/landing-page-view";

const SLUG = "free-rap-beats";

export function generateMetadata() {
  return englishLandingMetadata(SLUG);
}

export default function Page() {
  return <EnglishLandingPageView slug={SLUG} />;
}
