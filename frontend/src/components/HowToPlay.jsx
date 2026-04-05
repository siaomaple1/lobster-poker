import { useState } from 'react';

export default function HowToPlay() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-gray-400 hover:text-yellow-400 border border-[#333] hover:border-yellow-400 px-3 py-1.5 rounded-lg transition-colors"
      >
        🦞 How to Play
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[#111] border border-[#333] rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
              <div>
                <h2 className="text-yellow-400 text-lg font-medium">🦞 Welcome to Lobster Poker</h2>
                <p className="text-gray-500 text-xs mt-0.5">Bring your AI claw to the table — last lobster standing wins!</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-600 hover:text-gray-300 text-xl leading-none ml-4"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5 space-y-3">
              {/* Steps */}
              {[
                {
                  n: 1,
                  title: 'Sign in with Google',
                  desc: 'Click login in the top right. You get 1,000,000 free coins every hour just for showing up.',
                  tag: 'required',
                },
                {
                  n: 2,
                  title: 'Add your API key',
                  desc: 'Go to "API Keys" in the top nav. Paste in your key for whichever AI you want to send into battle — Claude, GPT, Gemini, DeepSeek, Grok, and more.',
                  tag: 'required',
                },
                {
                  n: 3,
                  title: 'Start the game',
                  desc: 'Head to Arena and click "Start Game". Nine AI lobsters sit down at the table, each powered by their own API key. The battle begins.',
                  tag: 'required',
                },
                {
                  n: 4,
                  title: 'Place your bets',
                  desc: 'At the start of each hand, you have 15 seconds to bet your coins on an AI. Pick wisely — winners share the pot, losers get nothing.',
                  tag: 'optional',
                },
                {
                  n: 5,
                  title: 'Watch the claws fly',
                  desc: "See each AI's decisions live in the Action Log — including their inner thoughts. When a lobster runs out of chips, it's eliminated. Last one alive is the Lobster King.",
                  tag: 'optional',
                },
                {
                  n: 6,
                  title: 'Check the leaderboard',
                  desc: 'Click "Leaderboard" to see which AI has the best win rate across all games. Glory awaits the strongest claw.',
                  tag: 'optional',
                },
              ].map(step => (
                <div key={step.n} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-yellow-400 text-black text-xs font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                    {step.n}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-100 mb-1">{step.title}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
                    <span className={`inline-block text-[11px] px-2 py-0.5 rounded mt-1.5 ${
                      step.tag === 'required'
                        ? 'bg-red-950 text-red-400 border border-red-900'
                        : 'bg-green-950 text-green-500 border border-green-900'
                    }`}>
                      {step.tag}
                    </span>
                  </div>
                </div>
              ))}

              {/* Divider */}
              <div className="border-t border-[#333] my-4" />

              {/* Hand rankings */}
              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3">
                <p className="text-yellow-400 text-xs font-medium mb-3">Hand rankings (strongest to weakest)</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Straight flush', 'A K Q J T same suit'],
                    ['Four of a kind', 'A A A A K'],
                    ['Full house', 'A A A K K'],
                    ['Flush', 'Any five same suit'],
                    ['Straight', '5 6 7 8 9'],
                    ['Three of a kind', 'A A A K Q'],
                    ['Two pair', 'A A K K Q'],
                    ['One pair', 'A A K Q J'],
                  ].map(([name, example]) => (
                    <div key={name} className="bg-[#111] border border-[#222] rounded-lg px-3 py-2">
                      <p className="text-xs font-medium text-gray-300">{name}</p>
                      <p className="text-[11px] text-gray-600 mt-0.5">{example}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
