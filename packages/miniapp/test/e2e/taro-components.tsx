import {
  createContext,
  forwardRef,
  useContext,
  type ChangeEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

type DetailEvent<T> = { detail: T };
type LooseProps = HTMLAttributes<HTMLElement> & Record<string, unknown>;

export const View = forwardRef<HTMLDivElement, LooseProps>(function View(props, ref) {
  return <div ref={ref} {...props} />;
});

export const Text = forwardRef<HTMLSpanElement, LooseProps>(function Text(
  { selectable: _selectable, ...props },
  ref,
) {
  return <span ref={ref} {...props} />;
});

export const Button = forwardRef<HTMLButtonElement, LooseProps>(function Button(
  { loading, formType: _formType, hoverClass: _hoverClass, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-busy={Boolean(loading)}
      {...props}
    >
      {children as ReactNode}
    </button>
  );
});

interface TaroInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onInput' | 'onChange'> {
  password?: boolean;
  onInput?: (event: DetailEvent<{ value: string }>) => void;
}

export const Input = forwardRef<HTMLInputElement, TaroInputProps>(function Input(
  { onInput, password, type, ...props },
  ref,
) {
  const inputType = password ? 'password' : type === 'digit' ? 'text' : type;
  return (
    <input
      ref={ref}
      type={inputType}
      onChange={(event) => onInput?.({ detail: { value: event.currentTarget.value } })}
      {...props}
    />
  );
});

interface TaroTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onInput' | 'onChange'> {
  focus?: boolean;
  onInput?: (event: DetailEvent<{ value: string }>) => void;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TaroTextareaProps>(function Textarea(
  { focus: _focus, onInput, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      onChange={(event) => onInput?.({ detail: { value: event.currentTarget.value } })}
      {...props}
    />
  );
});

type CheckboxGroupHandler = (event: DetailEvent<{ value: string[] }>) => void;
const CheckboxGroupContext = createContext<CheckboxGroupHandler | null>(null);

export function CheckboxGroup({ onChange, children, ...props }: LooseProps & {
  onChange?: CheckboxGroupHandler;
  children?: ReactNode;
}) {
  return (
    <CheckboxGroupContext.Provider value={onChange ?? null}>
      <div role="group" {...props}>{children}</div>
    </CheckboxGroupContext.Provider>
  );
}

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Checkbox({ value, onChange, ...props }, ref) {
    const groupChange = useContext(CheckboxGroupContext);
    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      onChange?.(event);
      groupChange?.({ detail: { value: event.currentTarget.checked ? [String(value)] : [] } });
    }
    return <input ref={ref} type="checkbox" value={value} onChange={handleChange} {...props} />;
  },
);

export const Label = forwardRef<HTMLLabelElement, HTMLAttributes<HTMLLabelElement>>(
  function Label(props, ref) {
    return <label ref={ref} {...props} />;
  },
);

export function ScrollView({
  scrollX: _scrollX,
  scrollY: _scrollY,
  lowerThreshold: _lowerThreshold,
  onScrollToLower,
  onScroll,
  ...props
}: LooseProps & { onScrollToLower?: () => void }) {
  return (
    <div
      {...props}
      onScroll={(event) => {
        onScroll?.(event);
        onScrollToLower?.();
      }}
    />
  );
}

export function Picker({
  mode: _mode,
  range: _range,
  onChange: _onChange,
  children,
  ...props
}: LooseProps & { children?: ReactNode }) {
  return <div {...props}>{children}</div>;
}

export function Image({ mode: _mode, src, alt = '', ...props }: LooseProps & { src?: string; alt?: string }) {
  return <img src={src} alt={alt} {...props} />;
}

export function Canvas({ canvasId, ...props }: LooseProps & { canvasId?: string }) {
  return <canvas data-canvas-id={canvasId} {...props} />;
}

export function Map({
  longitude: _longitude,
  latitude: _latitude,
  scale: _scale,
  markers: _markers,
  showLocation: _showLocation,
  ...props
}: LooseProps) {
  return <div role="img" aria-label="地块地图" {...props} />;
}
