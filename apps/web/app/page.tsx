import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { Hero } from "@/components/sections/hero"
import { Features } from "@/components/sections/features"
import { HowItWorks } from "@/components/sections/how-it-works"
import { Safety } from "@/components/sections/safety"
import { CliSection } from "@/components/sections/cli-section"
import { Cta } from "@/components/sections/cta"

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <Safety />
        <CliSection />
        <Cta />
      </main>
      <SiteFooter />
    </div>
  )
}
