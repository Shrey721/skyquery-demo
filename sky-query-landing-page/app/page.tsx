import { Navigation } from "@/components/landing/navigation";
import { HeroSection } from "@/components/landing/hero-section";
import { GuidedWalkthrough } from "@/components/landing/guided-walkthrough";
import { FeaturesSection } from "@/components/landing/features-section";
import { InteractiveDemo } from "@/components/landing/interactive-demo";
import { GlobalAviationSection } from "@/components/landing/global-aviation-section";
import { FinalCTA } from "@/components/landing/final-cta";
import { Footer } from "@/components/landing/footer";

export default function Page() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <Navigation />
      <HeroSection />
      <GuidedWalkthrough />
      <FeaturesSection />
      <InteractiveDemo />
      <GlobalAviationSection />
      <FinalCTA />
      <Footer />
    </main>
  );
}
