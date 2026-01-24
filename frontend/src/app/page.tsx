import { ConnectWallet } from "@/components/ConnectWallet";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] bg-lines">
      {/* Navigation */}
      <nav className="glass sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="dot dot-purple"></span>
              <span className="dot dot-cyan"></span>
              <span className="dot dot-green"></span>
            </div>
            <span className="text-xl font-bold text-[#1F2937]">0xElite</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-[#6B7280] hover:text-[#8B5CF6] transition-colors font-medium">Features</a>
            <a href="#how-it-works" className="text-[#6B7280] hover:text-[#8B5CF6] transition-colors font-medium">How It Works</a>
            <a href="#developers" className="text-[#6B7280] hover:text-[#8B5CF6] transition-colors font-medium">For Developers</a>
          </div>

          <ConnectWallet />
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Decorative gradient orb */}
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-[#8B5CF6] opacity-10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-[#22D3EE] opacity-10 rounded-full blur-3xl"></div>

        <div className="max-w-7xl mx-auto px-6 py-24 md:py-32">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-[#EDE9FE] text-[#7C3AED] px-4 py-2 rounded-full text-sm font-medium mb-6">
              <span className="dot dot-purple"></span>
              The Elite Dev Protocol
            </div>

            <h1 className="text-5xl md:text-6xl font-bold text-[#1F2937] mb-6 leading-tight">
              Where Top Web3 Talent
              <span className="gradient-text block">Meets Quality Projects</span>
            </h1>

            <p className="text-xl text-[#6B7280] mb-10 max-w-2xl mx-auto leading-relaxed">
              A curated platform exclusively for elite Web3 developers.
              Rapid team assembly through DAO-verified membership and proactive matching.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/apply" className="btn-primary text-lg">
                Apply as Developer
              </a>
              <button className="btn-secondary text-lg">
                Post a Project
              </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 mt-16 max-w-2xl mx-auto">
              <div>
                <div className="text-3xl font-bold gradient-text">500+</div>
                <div className="text-[#6B7280] text-sm mt-1">Elite Developers</div>
              </div>
              <div>
                <div className="text-3xl font-bold gradient-text">$2M+</div>
                <div className="text-[#6B7280] text-sm mt-1">Secured in Escrow</div>
              </div>
              <div>
                <div className="text-3xl font-bold gradient-text">98%</div>
                <div className="text-[#6B7280] text-sm mt-1">Success Rate</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#1F2937] mb-4">
              Why Choose 0xElite?
            </h2>
            <p className="text-[#6B7280] text-lg max-w-2xl mx-auto">
              Built for the Web3 ecosystem with security, transparency, and quality at its core
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="card p-8">
              <div className="w-14 h-14 rounded-2xl bg-[#EDE9FE] flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-[#8B5CF6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-[#1F2937] mb-3">Elite Access</h3>
              <p className="text-[#6B7280] leading-relaxed">
                Only the most qualified Web3 developers accepted through rigorous DAO verification and peer voting.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="card p-8">
              <div className="w-14 h-14 rounded-2xl bg-[#CFFAFE] flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-[#0891B2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-[#1F2937] mb-3">Secure Escrow</h3>
              <p className="text-[#6B7280] leading-relaxed">
                Milestone-based payments with on-chain fund protection. Your money is safe until work is delivered.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="card p-8">
              <div className="w-14 h-14 rounded-2xl bg-[#D1FAE5] flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-[#059669]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-[#1F2937] mb-3">DAO Arbitration</h3>
              <p className="text-[#6B7280] leading-relaxed">
                Decentralized dispute resolution with stake-weighted voting ensures fair outcomes for all parties.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-24 bg-[#F5F3FF]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#1F2937] mb-4">
              How It Works
            </h2>
            <p className="text-[#6B7280] text-lg max-w-2xl mx-auto">
              Get matched with elite developers in under 48 hours
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { step: "01", title: "Submit Project", desc: "Describe your needs, budget, and timeline" },
              { step: "02", title: "Platform Review", desc: "We verify project quality and requirements" },
              { step: "03", title: "Team Assembly", desc: "Matched developers receive your invitation" },
              { step: "04", title: "Start Building", desc: "Milestone-based work with escrow protection" },
            ].map((item, i) => (
              <div key={i} className="relative">
                <div className="card p-6 text-center h-full">
                  <div className="text-4xl font-bold gradient-text mb-4">{item.step}</div>
                  <h3 className="text-lg font-semibold text-[#1F2937] mb-2">{item.title}</h3>
                  <p className="text-[#6B7280] text-sm">{item.desc}</p>
                </div>
                {i < 3 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2">
                    <svg className="w-6 h-6 text-[#8B5CF6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Developers Section */}
      <section id="developers" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-[#1F2937] mb-6">
                Built for Elite Developers
              </h2>
              <p className="text-[#6B7280] text-lg mb-8 leading-relaxed">
                Join a curated network of the best Web3 talent. No bidding wars, no race to the bottom.
                Just quality projects that match your expertise.
              </p>

              <div className="space-y-4">
                {[
                  "Verified on-chain reputation (SBT)",
                  "Proactive project matching",
                  "Competitive rates (5-15% platform fee)",
                  "Stake-based commitment system",
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#EDE9FE] flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-[#8B5CF6]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-[#1F2937]">{item}</span>
                  </div>
                ))}
              </div>

              <button className="btn-primary mt-8">
                Apply for Membership
              </button>
            </div>

            <div className="relative">
              <div className="card p-8">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#A78BFA] flex items-center justify-center text-white text-2xl font-bold">
                    JD
                  </div>
                  <div>
                    <div className="font-semibold text-[#1F2937]">John Developer</div>
                    <div className="text-[#6B7280] text-sm">Solidity Expert</div>
                  </div>
                  <div className="ml-auto">
                    <span className="inline-flex items-center gap-1 bg-[#D1FAE5] text-[#059669] px-3 py-1 rounded-full text-sm font-medium">
                      <span className="w-2 h-2 rounded-full bg-[#059669]"></span>
                      Verified
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-3 bg-[#F9FAFB] rounded-xl">
                    <div className="text-2xl font-bold text-[#1F2937]">47</div>
                    <div className="text-xs text-[#6B7280]">Projects</div>
                  </div>
                  <div className="text-center p-3 bg-[#F9FAFB] rounded-xl">
                    <div className="text-2xl font-bold text-[#1F2937]">98%</div>
                    <div className="text-xs text-[#6B7280]">On-time</div>
                  </div>
                  <div className="text-center p-3 bg-[#F9FAFB] rounded-xl">
                    <div className="text-2xl font-bold text-[#1F2937]">4.9</div>
                    <div className="text-xs text-[#6B7280]">Rating</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {["Solidity", "DeFi", "Auditing", "ERC-721"].map((skill) => (
                    <span key={skill} className="px-3 py-1 bg-[#EDE9FE] text-[#7C3AED] rounded-lg text-sm font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Floating decoration */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-[#8B5CF6] opacity-10 rounded-full blur-2xl"></div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-[#8B5CF6] to-[#7C3AED]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Build the Future of Web3?
          </h2>
          <p className="text-white/80 text-lg mb-10 max-w-2xl mx-auto">
            Join the elite network of Web3 developers and clients building the next generation of decentralized applications.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-white text-[#8B5CF6] font-semibold px-8 py-4 rounded-xl hover:bg-[#F5F3FF] transition-colors">
              Get Started
            </button>
            <button className="border-2 border-white text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/10 transition-colors">
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1F2937] text-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-1">
                  <span className="dot dot-purple"></span>
                  <span className="dot dot-cyan"></span>
                  <span className="dot dot-green"></span>
                </div>
                <span className="text-xl font-bold">0xElite</span>
              </div>
              <p className="text-gray-400 text-sm">
                The elite dev protocol for Web3 builders.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Platform</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Find Developers</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Post a Project</a></li>
                <li><a href="#" className="hover:text-white transition-colors">How It Works</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Developers</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Apply</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Reputation System</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Documentation</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Whitepaper</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Smart Contracts</a></li>
                <li><a href="#" className="hover:text-white transition-colors">GitHub</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-gray-400 text-sm">
              Built for Web3 Capstone Project
            </p>
            <div className="flex gap-6">
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
