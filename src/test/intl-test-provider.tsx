/**
 * Test-only: wrap a React tree in NextIntlClientProvider with the default
 * Polish messages, so mounted components resolve the same copy as the app.
 */
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";

import pl from "../../messages/pl.json";

export function withIntl(node: ReactNode): ReactNode {
  return (
    <NextIntlClientProvider locale="pl" messages={pl} timeZone="Europe/Warsaw">
      {node}
    </NextIntlClientProvider>
  );
}
