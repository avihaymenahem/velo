/** Split inbox mockup showing category tabs + categorized threads */
import { Inbox, Bell, Tag, Users, Newspaper, Paperclip, Star } from 'lucide-react'

const TABS = [
  { icon: Inbox, label: 'Primary', count: 8, active: true },
  { icon: Bell, label: 'Updates', count: 3 },
  { icon: Tag, label: 'Promotions', count: 5 },
  { icon: Users, label: 'Social', count: 2 },
  { icon: Newspaper, label: 'Newsletters' },
]

const THREADS = [
  { sender: 'Alex Chen', subject: 'Q1 product roadmap review', snippet: 'Hey team, here are the updated milestones for next quarter...', time: '10:32 AM', unread: true, avatar: 'A', starred: true },
  { sender: 'Sarah Kim', subject: 'Design review meeting notes', snippet: 'Here are the action items from today\'s design review...', time: '9:15 AM', unread: true, avatar: 'S' },
  { sender: 'David Park', subject: 'Re: API integration spec', snippet: 'I\'ve reviewed the spec and have a few questions about the...', time: '8:45 AM', unread: true, avatar: 'D', attachment: true },
  { sender: 'Maria Lopez', subject: 'Client onboarding checklist', snippet: 'The updated checklist is attached. Please review before...', time: 'Yesterday', unread: false, avatar: 'M', attachment: true },
  { sender: 'James Wilson', subject: 'Budget approval for Q2', snippet: 'Hi team, I need approval for the following budget items...', time: 'Yesterday', unread: false, avatar: 'J' },
  { sender: 'Emily Zhang', subject: 'New hire orientation schedule', snippet: 'Welcome aboard! Here\'s the schedule for your first week...', time: 'Jan 28', unread: false, avatar: 'E' },
]

export function SplitInboxMockup() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0e0e11] overflow-hidden shadow-2xl shadow-black/50">
      {/* Category tabs */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.06] overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
              tab.active
                ? 'text-indigo-400 bg-indigo-500/10'
                : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.03]'
            }`}
          >
            <tab.icon size={12} />
            {tab.label}
            {tab.count && (
              <span className={`text-[9px] px-1.5 rounded-full ${
                tab.active ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-600'
              }`}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Thread list */}
      <div>
        {THREADS.map((thread, i) => (
          <div
            key={i}
            className={`px-4 py-3 border-b border-white/[0.04] ${
              i === 0 ? 'bg-white/[0.03]' : ''
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium flex-shrink-0 mt-0.5 ${
                thread.unread ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-500'
              }`}>{thread.avatar}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className={`text-[12px] ${thread.unread ? 'text-zinc-200 font-semibold' : 'text-zinc-500'}`}>{thread.sender}</span>
                  <span className="text-[10px] text-zinc-600 ml-2 flex-shrink-0">{thread.time}</span>
                </div>
                <div className={`text-[12px] truncate mt-0.5 ${thread.unread ? 'text-zinc-300' : 'text-zinc-600'}`}>{thread.subject}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-zinc-700 truncate">{thread.snippet}</span>
                  {thread.starred && <Star size={10} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
                  {thread.attachment && <Paperclip size={10} className="text-zinc-600 flex-shrink-0" />}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
