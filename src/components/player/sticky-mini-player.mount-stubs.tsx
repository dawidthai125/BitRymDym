/**
 * Test-only stubs for StickyMiniPlayer mount harness.
 * Not imported by production app routes. No Audio, no Supabase, no network.
 */
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
  type CSSProperties,
} from "react";

/** Mirrors PlayerContextValue shape used by StickyMiniPlayer — no HTMLAudioElement. */
export type MountPlayerTrack = {
  beatId: string;
  title: string;
  producer: string;
  durationSeconds: number;
  artworkVariant: number;
};

type MountPlayerValue = {
  track: MountPlayerTrack | null;
  phase: "idle" | "loading" | "playing" | "paused" | "error";
  currentTime: number;
  duration: number;
  error: string | null;
  suppressed: boolean;
  activateTrack: () => Promise<void>;
  playTrack: () => Promise<void>;
  toggle: () => void;
  seek: (time: number) => void;
  close: () => void;
  setSuppressed: (value: boolean) => void;
};

const MountPlayerContext = createContext<MountPlayerValue | null>(null);

const FIXTURE_TRACK: MountPlayerTrack = {
  beatId: "mount-fixture-beat",
  title: "Mount fixture bit",
  producer: "Test Producer",
  durationSeconds: 120,
  artworkVariant: 0,
};

function forbiddenAudioAction(name: string): never {
  throw new Error(`mount harness forbids audio action: ${name}`);
}

/** Replaces `@/components/player/player-provider` via esbuild alias. */
export function usePlayer(): MountPlayerValue {
  const ctx = useContext(MountPlayerContext);
  if (!ctx) {
    throw new Error("usePlayer must be used within MountPlayerProvider");
  }
  return ctx;
}

export function usePlayerOptional(): MountPlayerValue | null {
  return useContext(MountPlayerContext);
}

/** Controlled paused track — toggle/seek/close throw if invoked. */
export function MountPlayerProvider({ children }: { children: ReactNode }) {
  const value = useMemo<MountPlayerValue>(
    () => ({
      track: FIXTURE_TRACK,
      phase: "paused",
      currentTime: 0,
      duration: 120,
      error: null,
      suppressed: false,
      activateTrack: async () => forbiddenAudioAction("activateTrack"),
      playTrack: async () => forbiddenAudioAction("playTrack"),
      toggle: () => forbiddenAudioAction("toggle"),
      seek: () => forbiddenAudioAction("seek"),
      close: () => forbiddenAudioAction("close"),
      setSuppressed: () => undefined,
    }),
    [],
  );
  return (
    <MountPlayerContext.Provider value={value}>
      {children}
    </MountPlayerContext.Provider>
  );
}

/** `next/link` stub */
export function NextLink({
  href,
  children,
  className,
  ...rest
}: {
  href: string;
  children?: ReactNode;
  className?: string;
  [key: string]: unknown;
}) {
  return (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  );
}

/** `next/navigation` stub — public path (not /admin). */
export function usePathname(): string {
  return "/";
}

/** `next/image` stub — no remote fetch (src may 404; layout only). */
export default function NextImage(props: {
  src: string;
  alt?: string;
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
  sizes?: string;
}) {
  const style: CSSProperties = props.fill
    ? {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        ...props.style,
      }
    : { ...props.style };
  return (
    // eslint-disable-next-line @next/next/no-img-element -- test stub
    <img src={props.src} alt={props.alt ?? ""} className={props.className} style={style} />
  );
}
