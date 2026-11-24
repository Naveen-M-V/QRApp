import { NextResponse } from "next/server";
import { getPublicForm } from "@/lib/forms/server";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { status, body } = await getPublicForm(slug);
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
