import { useState } from 'react';
import { useT } from '../utils/i18n.js';

export default function HowToPlay() {
  const [open, setOpen] = useState(false);
  const t = useT();

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-gray-400 hover:text-yellow-400 border border-[#333] hover:border-yellow-400 px-3 py-1.5 rounded-lg transition-colors"
      >
        {t.howToPlay.buttonLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[#111] border border-[#333] rounded-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#333]">
              <div>
                <h2 className="text-yellow-400 text-lg font-medium">{t.howToPlay.title}</h2>
                <p className="text-gray-500 text-xs mt-0.5">{t.howToPlay.subtitle}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-600 hover:text-gray-300 text-xl leading-none ml-4"
                aria-label="Close how to play"
              >
                x
              </button>
            </div>

            <div className="px-6 py-5 space-y-3">
              {t.howToPlay.steps.map((step, idx) => (
                <div key={idx} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3 flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-yellow-400 text-black text-xs font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-100 mb-1">{step.title}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
                    <span
                      className={`inline-block text-[11px] px-2 py-0.5 rounded mt-1.5 ${
                        step.tag === 'required'
                          ? 'bg-red-950 text-red-400 border border-red-900'
                          : 'bg-green-950 text-green-500 border border-green-900'
                      }`}
                    >
                      {step.tag === 'required' ? t.howToPlay.required : t.howToPlay.optional}
                    </span>
                  </div>
                </div>
              ))}

              <div className="border-t border-[#333] my-4" />

              <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl px-4 py-3">
                <p className="text-yellow-400 text-xs font-medium mb-3">{t.howToPlay.rankingsTitle}</p>
                <div className="grid grid-cols-2 gap-2">
                  {t.howToPlay.handRankings.map(([name, example]) => (
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
