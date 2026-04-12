// Animated audio-bar indicator — replaces circular spinners throughout the app.
// Four bars animate like an EQ visualizer with staggered phases.
// Pass a Tailwind size-* class (e.g. "size-5") to control the bounding box;
// bars fill the container height and divide the width equally.

interface AudioBarsProps {
  className?: string;
}

const DELAYS = [0, 250, 125, 375]; // ms — offset each bar for a wave feel

export function AudioBars({ className = "size-5" }: AudioBarsProps) {
  return (
    <span
      className={`inline-flex items-end gap-px shrink-0 ${className}`}
      role="status"
      aria-label="Loading"
    >
      {DELAYS.map((delay) => (
        <span
          key={delay}
          className="flex-1 bg-current rounded-[1px]"
          style={{
            height: "100%",
            animation: `odio-bars 700ms ease-in-out ${delay}ms infinite`,
            transformOrigin: "bottom",
          }}
        />
      ))}
    </span>
  );
}
