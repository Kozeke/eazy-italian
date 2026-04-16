import React from 'react';
import toast from 'react-hot-toast';

export type SessionExpiredChoice = 'stay' | 'logout' | 'timeout';

let activePrompt:
  | {
      promise: Promise<SessionExpiredChoice>;
      resolve: (choice: SessionExpiredChoice) => void;
      toastId: string;
      intervalId: number;
      timeoutId: number;
      secondsLeft: number;
    }
  | undefined;

function renderToast(secondsLeft: number, onStay: () => void, onLogout: () => void) {
  return (
    <div className="w-[360px] rounded-xl border border-slate-200 bg-white shadow-lg ring-1 ring-black/5">
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="text-sm font-semibold text-slate-900">Session expired</div>
        <div className="mt-1 text-xs text-slate-600">
          Your login expired. Click <span className="font-semibold">Stay logged in</span> to refresh your session.
        </div>
      </div>
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          Logging out in <span className="font-semibold text-slate-900">{secondsLeft}s</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Log out
          </button>
          <button
            type="button"
            onClick={onStay}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
          >
            Stay logged in
          </button>
        </div>
      </div>
    </div>
  );
}

export function promptSessionExpired(seconds: number = 10): Promise<SessionExpiredChoice> {
  if (activePrompt) return activePrompt.promise;

  const toastId = 'session-expired';
  let resolveFn: (choice: SessionExpiredChoice) => void = () => {};

  const promise = new Promise<SessionExpiredChoice>((resolve) => {
    resolveFn = resolve;
  });

  const cleanup = (choice: SessionExpiredChoice) => {
    try {
      window.clearInterval(activePrompt?.intervalId);
      window.clearTimeout(activePrompt?.timeoutId);
    } finally {
      toast.dismiss(toastId);
      activePrompt = undefined;
      resolveFn(choice);
    }
  };

  const onStay = () => cleanup('stay');
  const onLogout = () => cleanup('logout');

  // Initial render
  toast.custom(() => renderToast(seconds, onStay, onLogout), {
    id: toastId,
    duration: Infinity,
  });

  let secondsLeft = seconds;

  const intervalId = window.setInterval(() => {
    secondsLeft = Math.max(0, secondsLeft - 1);
    if (secondsLeft <= 0) return;
    toast.custom(() => renderToast(secondsLeft, onStay, onLogout), {
      id: toastId,
      duration: Infinity,
    });
  }, 1000);

  const timeoutId = window.setTimeout(() => cleanup('timeout'), seconds * 1000);

  activePrompt = {
    promise,
    resolve: resolveFn,
    toastId,
    intervalId,
    timeoutId,
    secondsLeft,
  };

  return promise;
}

