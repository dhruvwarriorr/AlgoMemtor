import { useState } from 'react'
import { useReducedMotion } from 'motion/react'

import { useAuth } from '@/features/auth/useAuth'
import { CinematicIntro } from '@/features/landing/CinematicIntro'
import { WaveHero } from '@/features/landing/WaveHero'
import { hasSeenIntro } from '@/features/landing/intro-storage'
import { WaveField } from '@/features/landing/WaveField'
import {
  ClosingCta,
  CoachToolkit,
  HowItWorks,
  JourneyTimeline,
  LandingFooter,
  WhyItMatters,
} from '@/features/landing/LandingSections'

// Dark, cinematic landing: a wave field behind everything, a once-per-tab
// intro, a brand word that fills with liquid and scatters on scroll, then the
// coach story section by section.
function LandingPage() {
  const { status } = useAuth()
  const reduceMotion = useReducedMotion()
  const [introDone, setIntroDone] = useState(
    () => typeof window === 'undefined' || hasSeenIntro(),
  )
  const showIntro = status === 'unauthenticated' && !introDone && !reduceMotion

  return (
    <>
      {showIntro ? (
        <CinematicIntro onComplete={() => setIntroDone(true)} />
      ) : null}
      <WaveField />
      <main
        className="relative z-10 flex-1 overflow-x-clip text-white"
        id="main-content"
      >
        <WaveHero status={status} />
        <JourneyTimeline />
        <WhyItMatters />
        <HowItWorks />
        <CoachToolkit />
        <ClosingCta status={status} />
      </main>
      <div className="relative z-10">
        <LandingFooter />
      </div>
    </>
  )
}

export default LandingPage
