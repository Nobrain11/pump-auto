import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ traders: [], note: "The verified activity index is not connected." }, { status: 200 });
}
