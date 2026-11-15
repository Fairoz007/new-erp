// Invoice, credit note and debit note as A4 pages on the company letterhead, for the screen preview
// and for printing. Same geometry and blocks as the PDF (src/lib/letterheadPdf.ts):
//   * the letterhead image behind every page;
//   * title and number in the top right corner of every page;
//   * page 1 block (seller VAT/CR, bill-to, dates, office, reference, LPO);
//   * the lines table, its header repeated on every page, rows never split;
//   * totals with the amount in words, bank details, signature and stamp;
//   * "<number> · Page x of y" in the bottom corner, just above the band.
// Pages are planned by measuring the real rows (planPages), so the page count is known and printed.
// Printing uses a print root mounted on <body>: @page A4 with zero margins, one element per page.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BODY_HEIGHT, pageLabel, planPages, type InvoicePrintData, type PagePlan } from '../../lib/invoicePrint';
import { loadLetterheadUrl } from '../../lib/brandAssets';

const mm = (v: number) => `${v}mm`;

const cellCls = 'lh-cell';
const colWidths = (discount: boolean) => (discount ? [8, null, 16, 21, 18, 13, 19, 25] : [8, null, 18, 23, 14, 21, 27]);

const Head: React.FC<{ d: InvoicePrintData }> = ({ d }) => (
  <thead>
    <tr>
      {['#', 'Description', 'Qty', 'Unit price', ...(d.showDiscount ? ['Discount'] : []), 'VAT %', 'VAT', `Amount (${d.currency})`].map((h, i) => (
        <th key={h} scope="col" className={`${cellCls} lh-th`} style={{ textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>
      ))}
    </tr>
  </thead>
);

const Row: React.FC<{ d: InvoicePrintData; i: number }> = ({ d, i }) => {
  const l = d.lines[i];
  const cells = [String(l.no), null, l.quantity, l.unitPrice, ...(d.showDiscount ? [l.discount] : []), l.vatRate, l.vat, l.amount];
  return (
    <tr className="lh-row">
      {cells.map((c, k) => k === 1 ? (
        <td key={k} className={cellCls}>
          <span>{l.description}</span>
          {l.detail && <span className="lh-detail">{l.detail}</span>}
        </td>
      ) : (
        <td key={k} className={cellCls} style={{ textAlign: k >= 2 ? 'right' : 'left' }}>{c}</td>
      ))}
    </tr>
  );
};

const Table: React.FC<{ d: InvoicePrintData; from: number; to: number; measure?: boolean }> = ({ d, from, to }) => (
  <table className="lh-table">
    <colgroup>{colWidths(d.showDiscount).map((w, i) => <col key={i} style={w ? { width: mm(w) } : undefined} />)}</colgroup>
    <Head d={d} />
    <tbody>
      {d.lines.length === 0 && from === 0 && (
        <tr><td className={cellCls} colSpan={d.showDiscount ? 8 : 7} style={{ textAlign: 'center', color: 'var(--lh-muted)' }}>No lines</td></tr>
      )}
      {Array.from({ length: Math.max(0, to - from) }, (_, k) => <Row key={from + k} d={d} i={from + k} />)}
    </tbody>
  </table>
);

const FirstBlock: React.FC<{ d: InvoicePrintData }> = ({ d }) => (
  <div className="lh-first">
    <p className="lh-seller">{[d.seller.name, d.seller.vat && `VATIN ${d.seller.vat}`, d.seller.cr && `CR ${d.seller.cr}`].filter(Boolean).join('   ·   ')}</p>
    {!d.posted && <p className="lh-draft">{d.status.toUpperCase()}: NOT POSTED TO THE LEDGER</p>}
    <div className="lh-cols">
      <div>
        <p className="lh-label">{d.party.label.toUpperCase()}</p>
        <p className="lh-party">{d.party.name}</p>
        {d.party.address && <p>{d.party.address}</p>}
        {d.party.vat && <p>VATIN {d.party.vat}</p>}
        {d.party.phone && <p>Phone {d.party.phone}</p>}
      </div>
      <dl className="lh-facts">
        {d.facts.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
      </dl>
    </div>
  </div>
);

const Totals: React.FC<{ d: InvoicePrintData }> = ({ d }) => (
  <div className="lh-totals-wrap">
    <div className="lh-words">
      <p className="lh-label">AMOUNT IN WORDS</p>
      <p className="lh-strong">{d.currency} {d.words}</p>
      {d.notes && <p className="lh-muted">Notes: {d.notes}</p>}
      {d.terms && <p className="lh-muted">Terms: {d.terms}</p>}
    </div>
    <dl className="lh-totals">
      {d.totals.map(t => (
        <div key={t.label} className={t.strong ? 'lh-total' : undefined}><dt>{t.label}</dt><dd>{t.value}</dd></div>
      ))}
    </dl>
  </div>
);

const BankAndSign: React.FC<{ d: InvoicePrintData }> = ({ d }) => (
  <div className="lh-close">
    {d.bank.length > 0 && (
      <div>
        <p className="lh-label">BANK DETAILS</p>
        <dl className="lh-facts lh-bank">{d.bank.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
      </div>
    )}
    <div className="lh-sign">
      <span>Prepared by</span>
      <span>Authorised signature &amp; stamp</span>
    </div>
  </div>
);

const BLOCKS = [Totals, BankAndSign];

const Pages: React.FC<{ d: InvoicePrintData; plan: PagePlan[]; letterhead: string | null }> = ({ d, plan, letterhead }) => (
  <>
    {plan.map((p, i) => (
      <section key={i} className="lh-page" aria-label={`Page ${i + 1} of ${plan.length}`}>
        {letterhead && <img src={letterhead} alt="" className="lh-bg" />}
        <div className="lh-corner">
          <p className="lh-title">{d.title}</p>
          <p className="lh-number">{d.number}</p>
        </div>
        <div className="lh-body">
          {i === 0 && <FirstBlock d={d} />}
          {(p.rows[1] > p.rows[0] || (i === 0 && d.lines.length === 0)) && <Table d={d} from={p.rows[0]} to={p.rows[1]} />}
          {p.blocks.map(b => { const C = BLOCKS[b]; return <C key={b} d={d} />; })}
        </div>
        <p className="lh-foot">{pageLabel(d.number, i + 1, plan.length)}</p>
      </section>
    ))}
  </>
);

/** Measure rows and blocks (in mm) in an off-screen copy and plan the pages. */
function usePagePlan(d: InvoicePrintData, measureRef: React.RefObject<HTMLDivElement>): PagePlan[] {
  const fallback = useMemo(() => [{ rows: [0, d.lines.length] as [number, number], blocks: [0, 1] }], [d]);
  const [plan, setPlan] = useState<PagePlan[]>(fallback);
  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const run = () => {
      const ruler = el.querySelector<HTMLElement>('.lh-ruler');
      const pxPerMm = ruler ? ruler.getBoundingClientRect().width / 100 : 3.7795;
      const h = (n: Element | null) => (n ? n.getBoundingClientRect().height / pxPerMm : 0);
      const rows = [...el.querySelectorAll('.lh-measure-table tbody tr.lh-row')].map(h);
      setPlan(planPages(rows, {
        body: BODY_HEIGHT,
        firstExtra: h(el.querySelector('.lh-first')) + 1,
        head: h(el.querySelector('.lh-measure-table thead')),
        blocks: [h(el.querySelector('.lh-totals-wrap')) + 4, h(el.querySelector('.lh-close')) + 2],
      }));
    };
    run();
    // fonts may arrive after the first layout
    document.fonts?.ready.then(run).catch(() => undefined);
  }, [d, measureRef]);
  return plan;
}

interface Props {
  data: InvoicePrintData;
}

/** Screen preview (scaled to the dialog width) plus the print root used by window.print(). */
export const LetterheadDocument: React.FC<Props> = ({ data }) => {
  const [letterhead, setLetterhead] = useState<string | null>(null);
  useEffect(() => { let live = true; loadLetterheadUrl().then(u => { if (live) setLetterhead(u); }).catch(() => undefined); return () => { live = false; }; }, []);
  const measureRef = useRef<HTMLDivElement>(null);
  const plan = usePagePlan(data, measureRef);

  // preview scale: an A4 page (210 mm) fitted to the available width
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / (210 * 3.7795)));
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  return (
    <>
      <div ref={wrapRef} className="lh-preview" aria-label={`${data.title} ${data.number}, ${plan.length} page${plan.length === 1 ? '' : 's'}`}>
        <div className="lh-stack" style={{ transform: `scale(${scale})`, height: `calc(${plan.length} * (297mm + 6mm) * ${scale})` }}>
          <Pages d={data} plan={plan} letterhead={letterhead} />
        </div>
      </div>
      {createPortal(
        <div id="letterhead-print" aria-hidden="true">
          <div ref={measureRef} className="lh-measure">
            <div className="lh-ruler" />
            <FirstBlock d={data} />
            <div className="lh-measure-table"><Table d={data} from={0} to={data.lines.length} /></div>
            <Totals d={data} />
            <BankAndSign d={data} />
          </div>
          <Pages d={data} plan={plan} letterhead={letterhead} />
        </div>,
        document.body,
      )}
    </>
  );
};
