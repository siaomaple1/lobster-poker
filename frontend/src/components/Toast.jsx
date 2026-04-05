import { useToastStore } from '../store/toastStore.js';

export default function Toast() {
  const { toasts } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-xs pointer-events-auto
            animate-fade-in
            ${t.type === 'error'
              ? 'bg-red-900/90 border border-red-700 text-red-200'
              : t.type === 'success'
                ? 'bg-green-900/90 border border-green-700 text-green-200'
                : 'bg-[#2a2a2a] border border-[#444] text-gray-200'
            }`}
        >
          {t.type === 'error' && <span className="mr-1.5">⚠️</span>}
          {t.type === 'success' && <span className="mr-1.5">✓</span>}
          {t.message}
        </div>
      ))}
    </div>
  );
}
