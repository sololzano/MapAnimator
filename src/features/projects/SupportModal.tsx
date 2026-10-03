import { useState } from 'react';
import { Button, Modal } from '../../ui/controls';
import { Icon } from '../../ui/icons';

/** Ko-fi, Buy Me a Coffee, GitHub Sponsors, PayPal… Leave empty to hide the donate button. */
export const DONATE_URL = '';
const REPO_URL = 'https://github.com/sololzano/MapAnimator';

const BILL: [string, string][] = [
  ['Cloud servers rented', '$0.00'],
  ['Bytes of your location history uploaded', '0'],
  ['GPU used', 'I need some'],
  ['Motorcycle icon, redrawn', 'until perfect'],
  ['Export bugs', "aiudaaaaaa"],
  ['Motion blur sub-frames per frame', 'up to 8'],
  ['Chilaquiles eaten while coding', 'never enough'],
];

const EXCUSES = [
  'No worries. The chilaquil was here anyway.',
  'Totally fine. Your GPU already paid in fan noise.',
  'Understood. The salsa verde will wait.',
  'Chilaquil!!!! Aiudaaaaaaa!!!',
];

export function SupportModal({ onClose }: { onClose: () => void }) {
  const [excuse, setExcuse] = useState<string | null>(null);
  return (
    <Modal title="Feed the chilaquil" onClose={onClose} width={520}>
      <p className="m-0 text-[14.5px] leading-[1.6] text-text-2 text-pretty">
        This app is free, has no ads, no account and never phones home, so it can't even guilt-trip you by email. This dialog is the only guilt trip, and you opened it yourself.
      </p>

      <div className="rounded-[14px] border border-dashed border-line-x bg-card px-3.5 py-4 font-mono text-[11.5px] sm:px-5 sm:text-[12.5px]">
        <div className="mb-3 text-center text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">La cuenta, por favor</div>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {BILL.map(([item, amount]) => (
            <li key={item} className="flex items-baseline gap-2">
              <span className="text-text-2">{item}</span>
              <span aria-hidden className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-line-x" />
              <span className="text-right whitespace-nowrap text-text">{amount}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-dashed border-line-x pt-3 text-[13px] font-semibold">
          <span>TOTAL</span>
          <span className="text-right text-accent">pay what you want (even $0)</span>
        </div>
      </div>

      <p className="m-0 text-[14.5px] leading-[1.6] text-text-2 text-pretty">
        If it turned your trip into a video your family actually watched to the end, consider buying me a plate of chilaquiles. No cloud bills to cover, so every cent goes to tortilla chips and salsa.
      </p>

      {excuse && <div role="status" className="rounded-xl bg-panel px-4 py-3 text-[13.5px] text-text-2">{excuse}</div>}

      <div className="flex flex-wrap justify-end gap-2.5">
        <Button className="h-[42px] px-4 text-[14px]" onClick={() => excuse ? onClose() : setExcuse(EXCUSES[Math.floor(Math.random() * EXCUSES.length)])}>
          {excuse ? 'Close' : "I'm broke"}
        </Button>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer"
          className="inline-flex h-[42px] items-center justify-center gap-2 rounded-[9px] border border-line-strong bg-card px-4 text-[14px] font-medium text-text hover:bg-panel">
          <Icon name="star" size={16} />Star on GitHub
        </a>
        {DONATE_URL && (
          <a href={DONATE_URL} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-[42px] items-center justify-center gap-2 rounded-[9px] border border-transparent bg-accent px-5 text-[14px] font-semibold text-on-accent hover:bg-accent-hover">
            <Icon name="heart" size={16} />Buy me chilaquiles
          </a>
        )}
      </div>
      <p className="m-0 text-center text-[12px] text-muted">Paying is optional. Every feature stays free, forever. Even the motorcycle.</p>
    </Modal>
  );
}
