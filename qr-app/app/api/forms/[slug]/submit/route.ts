import { NextResponse } from "next/server";
import { submitForm } from "@/lib/forms/server";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 3_000_000) {
    return NextResponse.json({ error: "Submission is too large." }, { status: 413 });
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  }
  const { status, body } = await submitForm(slug, formData);
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
