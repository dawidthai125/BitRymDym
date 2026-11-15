import { FullClientMessages } from "@/i18n/client-messages";

/** Beat detail hosts the recorder, which reads studio.* copy. */
export default function BeatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FullClientMessages>{children}</FullClientMessages>;
}
