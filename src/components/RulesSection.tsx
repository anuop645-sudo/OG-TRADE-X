import React from 'react';

const COLOUR_PAYOUT_ROWS = [
  {
    selection: 'Green',
    winningNumbers: '1, 3, 7, 9 (2x) · 5 (1.5x)',
    payout: '2x / 1.5x',
    accentClass: 'text-emerald-700',
  },
  {
    selection: 'Red',
    winningNumbers: '2, 4, 6, 8 (2x) · 0 (1.5x)',
    payout: '2x / 1.5x',
    accentClass: 'text-rose-600',
  },
  {
    selection: 'Violet',
    winningNumbers: '0, 5',
    payout: '4.5x',
    accentClass: 'text-violet-700',
  },
  {
    selection: 'Exact Number (0–9)',
    winningNumbers: 'Exact digit match',
    payout: '9x',
    accentClass: 'text-blue-700',
  },
  {
    selection: 'Big / Small',
    winningNumbers: 'Big: 5–9 · Small: 0–4',
    payout: '2x',
    accentClass: 'text-amber-700',
  },
];

const JHANDI_MUNDA_PAYOUT_ROWS = [
  {
    match: '2 Matching Dice',
    symbols: 'Any symbol appears 2 times on 6 dice',
    payout: '3x',
    rowBg: 'bg-emerald-50/70',
    titleColor: 'text-emerald-800',
    payoutColor: 'text-emerald-700',
  },
  {
    match: '3 Matching Dice',
    symbols: 'Any symbol appears 3 times on 6 dice',
    payout: '4x',
    rowBg: 'bg-blue-50/70',
    titleColor: 'text-blue-800',
    payoutColor: 'text-blue-700',
  },
  {
    match: '4 Matching Dice',
    symbols: 'Any symbol appears 4 times on 6 dice',
    payout: '5x',
    rowBg: 'bg-violet-50/70',
    titleColor: 'text-violet-800',
    payoutColor: 'text-violet-700',
  },
  {
    match: '5 Matching Dice',
    symbols: 'Any symbol appears 5 times on 6 dice',
    payout: '6x',
    rowBg: 'bg-amber-50/70',
    titleColor: 'text-amber-800',
    payoutColor: 'text-amber-700',
  },
  {
    match: '6 Matching Dice',
    symbols: 'All 6 dice land on the same symbol (Jackpot)',
    payout: '100x',
    rowBg: 'bg-rose-50/70',
    titleColor: 'text-rose-800',
    payoutColor: 'text-rose-700',
  },
];

const JHANDI_SPECIAL_RULES = [
  {
    label: '15s Auto Shake & Roll',
    detail: 'Har 15 second par cup automatically shake aur dice roll hota hai.',
    color: 'text-emerald-700',
  },
  {
    label: '30% Bet Deduction',
    detail: 'Har bet par 30% cut lagta hai aur net 70% stake par payout calculate hota hai.',
    color: 'text-rose-600',
  },
  {
    label: '25K DC Max Bet Limit',
    detail: 'Ek round me maximum 25K DC tak hi bet lagayi ja sakti hai.',
    color: 'text-blue-700',
  },
  {
    label: 'Consecutive Win 9% / 50% Cut',
    detail: 'Lagatar 2–5 wins par 9% cut aur 5 se zyada baar lagatar win hone par 50% cut hota hai.',
    color: 'text-amber-700',
  },
  {
    label: 'Round 7 & Round 11 Single Dice',
    detail: 'Sirf Round 7 aur Round 11 me sabhi 6 symbols par 1-1 single dice aata hai.',
    color: 'text-violet-700',
  },
  {
    label: '24 Hours Claim 10K',
    detail: 'Har 24 ghante ke baad 10K DC coins claim kar sakte hain.',
    color: 'text-indigo-700',
  },
];

interface RulesSectionProps {
  activeGame: 'colour' | 'jhandi' | 'chicken';
  isVipUnlimited?: boolean;
}

const COLOUR_SPECIAL_RULES = [
  {
    label: '30% Bet Deduction',
    detail: 'Har bet par 30% cut lagta hai aur net 70% contract amount par payout calculate hota hai.',
    color: 'text-rose-600',
  },
  {
    label: '25K DC Max Bet Limit',
    detail: 'Ek round me maximum 25K DC tak hi bet lagayi ja sakti hai.',
    color: 'text-blue-700',
  },
  {
    label: 'Consecutive Win 9% / 50% Cut',
    detail: 'Lagatar 2–5 wins par 9% cut aur 5 se zyada baar lagatar win hone par 50% cut lagta hai.',
    color: 'text-amber-700',
  },
  {
    label: '24 Hours Claim 10K',
    detail: 'Har 24 ghante ke baad 10K DC coins claim kar sakte hain.',
    color: 'text-indigo-700',
  },
];

const CHICKEN_DIFFICULTY_ROWS = [
  {
    mode: 'Easy',
    lanes: '12 Lanes',
    stepOne: '1.15x',
    maxPayout: '12.00x',
    accentClass: 'text-emerald-700',
  },
  {
    mode: 'Medium',
    lanes: '10 Lanes',
    stepOne: '1.30x',
    maxPayout: '30.00x',
    accentClass: 'text-blue-700',
  },
  {
    mode: 'Hard',
    lanes: '8 Lanes',
    stepOne: '1.65x',
    maxPayout: '75.00x',
    accentClass: 'text-amber-700',
  },
  {
    mode: 'Hardcore',
    lanes: '6 Lanes',
    stepOne: '2.25x',
    maxPayout: '150.00x',
    accentClass: 'text-rose-600',
  },
];

const CHICKEN_SPECIAL_RULES = [
  {
    label: 'Cash Out Anytime',
    detail: 'Kam se kam 1 safe lane cross karne ke baad aap kisi bhi step par Cash Out kar sakte hain.',
    color: 'text-emerald-700',
  },
  {
    label: '30% Bet Deduction',
    detail: 'Har bet par 30% cut lagta hai aur net 70% stake par current multiplier payout milta hai.',
    color: 'text-rose-600',
  },
  {
    label: '25K DC Max Bet Limit',
    detail: 'Ek crossing me maximum 25K DC tak hi bet lagayi ja sakti hai.',
    color: 'text-blue-700',
  },
  {
    label: 'Consecutive Win 9% / 50% Cut',
    detail: 'Lagatar 2–5 wins par 9% cut aur 5 se zyada baar lagatar win hone par 50% cut lagta hai.',
    color: 'text-amber-700',
  },
];

export const RulesSection: React.FC<RulesSectionProps> = ({
  activeGame,
  isVipUnlimited = false,
}) => {
  const formatVipRule = (rule: { label: string; detail: string; color: string }) => {
    if (!isVipUnlimited) return rule;
    if (rule.label.includes('25K DC Max Bet Limit')) {
      return {
        ...rule,
        label: 'No Bet Limit (VIP)',
        detail: 'Is VIP account par koi max bet limit nahi hai — full balance tak bet lagayi ja sakti hai.',
      };
    }
    if (rule.label.includes('24 Hours Claim 10K')) {
      return {
        ...rule,
        label: '1 Hour Claim 1Cr',
        detail: 'Is VIP account par har 1 ghante me login ya Claim 1Cr se 1Cr DC coins milte hain.',
      };
    }
    return rule;
  };

  return (
    <section id="rules" className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      {activeGame === 'colour' ? (
        <div>
          <div className="border-b border-slate-200 pb-3">
            <h2 className="font-display text-base font-bold text-slate-900">
              Colour Trade Rules
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Predict the winning colour, number (0–9), or size (Big/Small) before the 5-second lock window.
            </p>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 font-medium">Selection</th>
                  <th className="py-2 font-medium">Winning Outcome</th>
                  <th className="py-2 font-medium text-right">Multiplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {COLOUR_PAYOUT_ROWS.map((row) => (
                  <tr key={row.selection} className="hover:bg-slate-50">
                    <td className={`py-2.5 font-bold ${row.accentClass}`}>{row.selection}</td>
                    <td className="py-2.5 font-mono text-slate-600">{row.winningNumbers}</td>
                    <td className={`py-2.5 text-right font-mono font-bold tabular-nums ${row.accentClass}`}>
                      {row.payout}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {COLOUR_SPECIAL_RULES.map(formatVipRule).map((rule) => (
              <div
                key={rule.label}
                className="rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5"
              >
                <div className={`text-xs font-bold ${rule.color}`}>{rule.label}</div>
                <p className="mt-0.5 text-xs text-slate-600">{rule.detail}</p>
              </div>
            ))}
          </div>
        </div>
      ) : activeGame === 'jhandi' ? (
        <div id="jhandi-rules">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="font-display text-base font-bold text-emerald-800">
              Jhandi Munda Rules
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              6 Symbols: <span className="font-semibold text-slate-900">Club (Chidi)</span>,{' '}
              <span className="font-semibold text-violet-700">Crown (Munda)</span>,{' '}
              <span className="font-semibold text-slate-900">Spade (Hukum)</span>,{' '}
              <span className="font-semibold text-rose-600">Diamond (Eent)</span>,{' '}
              <span className="font-semibold text-amber-600">Flag (Jhandi)</span>,{' '}
              <span className="font-semibold text-rose-600">Heart (Paan)</span>. Bet wins when 2 or more dice match your symbol.
            </p>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 font-medium">Dice Match</th>
                  <th className="py-2 font-medium">Condition (6 Rolled Dice)</th>
                  <th className="py-2 font-medium text-right">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {JHANDI_MUNDA_PAYOUT_ROWS.map((row) => (
                  <tr key={row.match} className={row.rowBg}>
                    <td className={`py-2.5 px-2 font-bold ${row.titleColor}`}>{row.match}</td>
                    <td className="py-2.5 px-2 text-slate-700">{row.symbols}</td>
                    <td className={`py-2.5 px-2 text-right font-mono font-extrabold tabular-nums ${row.payoutColor}`}>
                      {row.payout}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {JHANDI_SPECIAL_RULES.map(formatVipRule).map((rule) => (
              <div
                key={rule.label}
                className="rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5"
              >
                <div className={`text-xs font-bold ${rule.color}`}>{rule.label}</div>
                <p className="mt-0.5 text-xs text-slate-600">{rule.detail}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div id="chicken-rules">
          <div className="border-b border-slate-200 pb-3">
            <h2 className="font-display text-base font-bold text-slate-900">
              Chicken Road Rules
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Choose a traffic mode, place your stake, and cross lanes while barriers block oncoming cars. Cash out anytime before a speeding car hits you.
            </p>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 font-medium">Difficulty</th>
                  <th className="py-2 font-medium">Total Lanes</th>
                  <th className="py-2 font-medium">Step 1</th>
                  <th className="py-2 font-medium text-right">Max Multiplier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {CHICKEN_DIFFICULTY_ROWS.map((row) => (
                  <tr key={row.mode} className="hover:bg-slate-50">
                    <td className={`py-2.5 font-bold ${row.accentClass}`}>{row.mode}</td>
                    <td className="py-2.5 font-mono text-slate-600">{row.lanes}</td>
                    <td className="py-2.5 font-mono font-semibold text-slate-700 tabular-nums">
                      {row.stepOne}
                    </td>
                    <td className={`py-2.5 text-right font-mono font-extrabold tabular-nums ${row.accentClass}`}>
                      {row.maxPayout}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {CHICKEN_SPECIAL_RULES.map(formatVipRule).map((rule) => (
              <div
                key={rule.label}
                className="rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5"
              >
                <div className={`text-xs font-bold ${rule.color}`}>{rule.label}</div>
                <p className="mt-0.5 text-xs text-slate-600">{rule.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
