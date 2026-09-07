const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

export function Segmented<T extends string>(props: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <div
      style={NO_DRAG}
      className="flex rounded-[9px] border border-[color:var(--grp-line)] bg-[color:var(--grp)] p-0.5"
    >
      {props.options.map((option) => {
        const on = option.value === props.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={props.disabled}
            onClick={() => {
              if (option.value !== props.value) props.onChange(option.value);
            }}
            className={`rounded-[7px] px-[13px] py-[5px] text-xs transition-[background,color,transform] duration-[180ms] ease-out ${
              on ? 'sg-btn-solid font-bold' : 'font-semibold text-dim2'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
