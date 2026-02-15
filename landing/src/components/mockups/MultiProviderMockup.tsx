/** Multi-provider mockup showing account switcher + provider logos */
import { Check, ChevronDown, Plus, Mail, Globe } from 'lucide-react'

const ACCOUNTS = [
  { name: 'Alex Chen', email: 'alex@company.com', provider: 'Gmail', avatar: 'A', color: 'bg-indigo-500/20 text-indigo-400', active: true },
  { name: 'Alex Chen', email: 'alex.chen@outlook.com', provider: 'Outlook', avatar: 'A', color: 'bg-sky-500/20 text-sky-400' },
  { name: 'Alex Personal', email: 'alex@icloud.com', provider: 'iCloud', avatar: 'A', color: 'bg-zinc-500/20 text-zinc-400' },
]

const PROVIDERS = [
  { name: 'Gmail', desc: 'Google OAuth', icon: Mail },
  { name: 'Outlook', desc: 'IMAP/SMTP', icon: Mail },
  { name: 'Yahoo', desc: 'IMAP/SMTP', icon: Mail },
  { name: 'iCloud', desc: 'IMAP/SMTP', icon: Mail },
  { name: 'Fastmail', desc: 'IMAP/SMTP', icon: Mail },
  { name: 'Any IMAP', desc: 'Custom server', icon: Globe },
]

export function MultiProviderMockup() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0e0e11] overflow-hidden shadow-2xl shadow-black/50">
      <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
        {/* Left: Account switcher */}
        <div className="flex-1">
          {/* Current account */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06]">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-[12px] text-indigo-400 font-medium">A</div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-zinc-200 font-medium">Alex Chen</div>
              <div className="text-[10px] text-zinc-600">alex@company.com</div>
            </div>
            <ChevronDown size={14} className="text-zinc-600" />
          </div>

          {/* Account list */}
          <div className="p-2">
            <div className="text-[9px] text-zinc-600 uppercase tracking-wider font-medium px-2 py-1.5">Accounts</div>
            {ACCOUNTS.map((account) => (
              <div
                key={account.email}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg ${
                  account.active ? 'bg-indigo-500/8' : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium ${account.color}`}>
                  {account.avatar}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-zinc-300 truncate">{account.name}</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${
                      account.provider === 'Gmail' ? 'bg-red-500/10 text-red-400' :
                      account.provider === 'Outlook' ? 'bg-sky-500/10 text-sky-400' :
                      'bg-zinc-700/50 text-zinc-500'
                    }`}>{account.provider}</span>
                  </div>
                  <div className="text-[10px] text-zinc-600 truncate">{account.email}</div>
                </div>
                {account.active && <Check size={12} className="text-indigo-400 flex-shrink-0" />}
              </div>
            ))}

            {/* Add account */}
            <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.03] mt-1 border-t border-white/[0.04] pt-3">
              <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center">
                <Plus size={12} className="text-zinc-500" />
              </div>
              <span className="text-[11px] text-zinc-500">Add account</span>
            </div>
          </div>
        </div>

        {/* Right: Supported providers */}
        <div className="w-full md:w-56 bg-[#0c0c0f]">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <div className="text-[12px] text-zinc-300 font-medium">Supported providers</div>
            <div className="text-[10px] text-zinc-600 mt-0.5">Auto-discovery for major providers</div>
          </div>
          <div className="p-2">
            {PROVIDERS.map((provider) => (
              <div key={provider.name} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.03]">
                <div className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                  <provider.icon size={13} className="text-zinc-500" />
                </div>
                <div>
                  <div className="text-[11px] text-zinc-400">{provider.name}</div>
                  <div className="text-[9px] text-zinc-700">{provider.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
