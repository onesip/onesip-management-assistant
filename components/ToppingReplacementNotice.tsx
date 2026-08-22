import React, { useEffect, useState } from 'react';

const NOTICE_VERSION = 'topping_replacement_rule_2026_08_22_v1';

type Props = {
  currentUser: any;
};

function ToppingReplacementNotice({ currentUser }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'staff') {
      setIsOpen(false);
      return;
    }

    const userKey = currentUser.id || currentUser.name || 'staff';
    const storageKey = `onesip_${NOTICE_VERSION}_${userKey}`;
    const acknowledged = localStorage.getItem(storageKey);
    setIsOpen(!acknowledged);
  }, [currentUser?.id, currentUser?.name, currentUser?.role]);

  if (!isOpen || currentUser?.role !== 'staff') return null;

  const acknowledge = () => {
    const userKey = currentUser.id || currentUser.name || 'staff';
    const storageKey = `onesip_${NOTICE_VERSION}_${userKey}`;
    localStorage.setItem(storageKey, new Date().toISOString());
    setIsOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[11750] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="bg-amber-50 px-5 py-5 border-b border-amber-100">
          <div className="text-[11px] font-black tracking-[0.18em] text-amber-700 uppercase mb-1">ONESIP Staff Notice</div>
          <h2 className="text-xl font-black text-gray-900">⚠️ Topping Replacement Rule</h2>
        </div>

        <div className="p-5 space-y-4 text-sm text-gray-700 leading-relaxed">
          <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
            <div className="font-black text-emerald-900 mb-1">ONLY when a FREE standard topping is actually OUT OF STOCK:</div>
            <div className="font-bold text-emerald-800">→ Replace it with another regular topping for FREE.</div>
          </div>

          <div className="space-y-2">
            <div><span className="font-black text-gray-900">Online:</span> check the customer's note.</div>
            <div><span className="font-black text-gray-900">In-store:</span> ask which regular topping they want instead whenever possible.</div>
          </div>

          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 text-xs">
            <span className="font-black text-gray-900">Example:</span> Passion Fruit Double Boom normally includes tapioca pearls. If tapioca is sold out, let the customer choose another regular topping.
          </div>

          <div className="rounded-2xl bg-red-50 border border-red-100 p-4 font-black text-red-700">
            ❌ Do NOT offer a free replacement for other reasons.
          </div>
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={acknowledge}
            className="w-full rounded-2xl bg-gray-900 text-white py-3.5 font-black text-sm active:scale-[0.99] transition-transform"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

class ToppingReplacementNoticeBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[ToppingReplacementNotice] render error', error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function SafeToppingReplacementNotice(props: Props) {
  return (
    <ToppingReplacementNoticeBoundary>
      <ToppingReplacementNotice {...props} />
    </ToppingReplacementNoticeBoundary>
  );
}
