import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Human engineer mailbox is off. Mix and master stay with Bitek. */
export function POST() {
  return NextResponse.json(
    { error: "gone", message: "Pytania do realizatora są wyłączone. Miks i master robi Bitek." },
    { status: 410 },
  );
}
