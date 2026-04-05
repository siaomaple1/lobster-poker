import { useState } from 'react';
import { useGameStore } from '../store/gameStore.js';
import { useT } from '../utils/i18n.js';
import { submitBugReport } from '../utils/api.js';

export default function ReportBug() {
  const [open, setOpen]           = useState(false);
  const [whatHappened, setWhat]   = useState('');
  const [expected, setExpected]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]           = useState(false);

  const { currentRoomId, handNumber } = useGameStore();
  const t = useT();

  const browser = typeof navigator !== 'undefined'
    ? `${navigator.userAgent.slice(0, 150)}`
    : '';

  const handleOpen = () => {
    setOpen(true);
    setDone(false);
    setWhat('');
    setExpected('');
  };

  const handleSubmit = async () => {
    if (!whatHappened.trim()) return;
    setSubmitting(true);
    try {
      await submitBugReport({
        roomId: currentRoomId,
        handNumber,
        browser,
        whatHappened: whatHappened.trim(),
        expected: expected.trim(),
      });
      setDone(true);
      setTimeout(() => setOpen(false), 2000);
    } catch {
      // silent — form stays open
    }
    setSubmitting(false);
  };

  const inputCls = 'w-full bg-[#2a2a2a] border border-[#444] rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-lobster resize-none';

  return (
    <>
      <button
        onClick={handleOpen}
        className="text-xs px-2 py-1.5 rounded-lg border border-[#444] text-gray-500 hover:text-gray-300 hover:border-[#666] transition-colors bg-[#1e1e1e] hover:bg-[#2a2a2a]"
        title={t.bugReport.title}
      >
        🐛
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-[#1e1e1e] border border-[#444] rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-bold text-white text-lg">{t.bugReport.title}</h3>

            {/* Prefilled context */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-[#2a2a2a] rounded-lg px-3 py-2">
                <div className="text-gray-500">{t.bugReport.prefillRoom}</div>
                <div className="text-gray-300 font-mono">#{currentRoomId}</div>
              </div>
              <div className="bg-[#2a2a2a] rounded-lg px-3 py-2">
                <div className="text-gray-500">{t.bugReport.prefillHand}</div>
                <div className="text-gray-300 font-mono">{handNumber || '—'}</div>
              </div>
              <div className="bg-[#2a2a2a] rounded-lg px-3 py-2">
                <div className="text-gray-500">{t.bugReport.prefillBrowser}</div>
                <div className="text-gray-300 font-mono truncate">{browser.split('/')[0]?.trim() || '—'}</div>
              </div>
            </div>

            {done ? (
              <div className="text-green-400 text-center py-4 text-sm font-medium">
                ✓ {t.bugReport.success}
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t.bugReport.whatHappened} *</label>
                  <textarea
                    autoFocus
                    value={whatHappened}
                    onChange={e => setWhat(e.target.value)}
                    placeholder={t.bugReport.whatHappenedPlaceholder}
                    rows={3}
                    maxLength={1000}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 mb-1 block">{t.bugReport.expected}</label>
                  <textarea
                    value={expected}
                    onChange={e => setExpected(e.target.value)}
                    placeholder={t.bugReport.expectedPlaceholder}
                    rows={2}
                    maxLength={500}
                    className={inputCls}
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setOpen(false)}
                    className="px-4 py-2 rounded-xl bg-[#2a2a2a] text-gray-400 hover:text-white text-sm"
                  >
                    {t.bugReport.cancel}
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !whatHappened.trim()}
                    className="px-4 py-2 rounded-xl bg-lobster hover:bg-red-700 text-white font-semibold text-sm disabled:opacity-50"
                  >
                    {submitting ? t.bugReport.submitting : t.bugReport.submit}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
