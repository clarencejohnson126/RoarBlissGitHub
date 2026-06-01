import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID parameter is required." }, { status: 400 });
    }

    const outputDir = path.join(process.cwd(), "public", "output");
    const logFilePath = path.join(outputDir, `${sessionId}_logs.txt`);

    if (!fs.existsSync(logFilePath)) {
      return NextResponse.json({ logs: [] });
    }

    const fileContent = fs.readFileSync(logFilePath, "utf-8");
    const logs = fileContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return NextResponse.json({ logs });
  } catch (error: unknown) {
    console.error("Logs API route error:", error);
    return NextResponse.json({ error: "Failed to fetch logs." }, { status: 500 });
  }
}
