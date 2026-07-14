type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'danger' | 'icon';
type StatusTone = 'active' | 'success' | 'warning' | 'neutral' | 'danger';

export const fluent = {
  blue: '#0078D4',
  blueHover: '#106EBE',
  border: '#E1DFDD',
  borderStrong: '#C8C6C4',
  page: '#F5F5F5',
  surface: '#FFFFFF',
  text: '#242424',
  textMuted: '#605E5C',
};

export const fluentFocus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0078D4]/40 focus-visible:ring-offset-1';

export function fluentButton(variant: ButtonVariant = 'secondary'): string {
  const base = `fluent-control inline-flex h-8 items-center justify-center gap-1.5 rounded-[4px] border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${fluentFocus}`;
  const variants: Record<ButtonVariant, string> = {
    primary: 'border-[#0078D4] bg-[#0078D4] text-white hover:bg-[#106EBE]',
    secondary: 'border-[#C8C6C4] bg-white text-[#242424] hover:bg-[#F3F2F1]',
    subtle: 'border-transparent bg-transparent text-[#242424] hover:bg-[#F3F2F1]',
    danger: 'border-[#A4262C] bg-[#A4262C] text-white hover:bg-[#8E1F25]',
    icon: 'fluent-icon-control h-8 w-8 border-transparent bg-transparent p-0 text-[#605E5C] hover:bg-[#F3F2F1] hover:text-[#242424]',
  };

  return `${base} ${variants[variant]}`;
}

export const fluentInput = `fluent-input-control h-8 rounded-[4px] border border-[#C8C6C4] bg-white px-3 text-sm text-[#242424] placeholder:text-[#8A8886] shadow-none transition-colors focus:border-[#0078D4] ${fluentFocus}`;

export const fluentSelect = `${fluentInput} pr-8`;

export const fluentTable = {
  wrapper: 'overflow-x-auto border border-[#E1DFDD] bg-white',
  table: 'w-full border-collapse text-sm',
  thead: 'border-b border-[#E1DFDD] bg-[#FAFAFA] text-left text-xs font-semibold uppercase tracking-normal text-[#605E5C]',
  th: 'h-9 px-3 align-middle font-semibold',
  row: 'border-b border-[#EDEBE9] text-[#242424] hover:bg-[#F5F9FF]',
  rowSelected: 'border-l-2 border-l-[#0078D4] bg-[#EFF6FC]',
  td: 'h-11 px-3 align-middle',
};

export function fluentStatusTag(tone: StatusTone): string {
  const base = 'inline-flex h-5 items-center rounded-[4px] px-2 text-xs font-semibold';
  const tones: Record<StatusTone, string> = {
    active: 'bg-[#E5F1FB] text-[#005A9E]',
    success: 'bg-[#DFF6DD] text-[#107C10]',
    warning: 'bg-[#FFF4CE] text-[#8A6A00]',
    neutral: 'bg-[#F3F2F1] text-[#605E5C]',
    danger: 'bg-[#FDE7E9] text-[#A4262C]',
  };

  return `${base} ${tones[tone]}`;
}
