import { useEffect } from 'react'
import Lenis from 'lenis'
import { Navbar } from './components/Navbar'
import { Hero } from './components/Hero'
import { WhyVelo } from './components/WhyVelo'
import { ProductShowcase } from './components/ProductShowcase'
import { Features } from './components/Features'
import { OpenSource } from './components/OpenSource'
import { CtaFooter } from './components/CtaFooter'
import './App.css'

function App() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    })

    function raf(time: number) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)

    return () => lenis.destroy()
  }, [])

  return (
    <div className="relative min-h-screen">
      <Navbar />
      <main>
        <Hero />
        <WhyVelo />
        <ProductShowcase />
        <Features />
        <OpenSource />
        <CtaFooter />
      </main>
    </div>
  )
}

export default App
