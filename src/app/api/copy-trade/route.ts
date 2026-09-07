import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Copy trading is not available until the shared strategy and risk services are connected." }, { status: 503 });
}
