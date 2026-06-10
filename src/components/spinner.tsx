type SpinnerProps = {
  className?: string;
  label?: string;
};

export function Spinner({ className = "", label = "Cargando" }: SpinnerProps) {
  return (
    <span aria-label={label} className={`spinner ${className}`} role="status" />
  );
}
