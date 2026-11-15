import { FullClientMessages } from "@/i18n/client-messages";

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FullClientMessages>{children}</FullClientMessages>;
}
