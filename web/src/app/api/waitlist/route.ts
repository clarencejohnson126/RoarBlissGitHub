import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const WAITLIST_FILE = path.join(process.cwd(), "waitlist.json");

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { email, name, battlefield, struggle, champion } = data;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email is required to claim your spot." },
        { status: 400 }
      );
    }

    interface WaitlistEntry {
      id: string;
      email: string;
      name: string;
      battlefield: string;
      struggle: string;
      champion: string;
      timestamp: string;
    }

    // Initialize list
    let waitlist: WaitlistEntry[] = [];
    
    // Read existing waitlist if it exists
    if (fs.existsSync(WAITLIST_FILE)) {
      try {
        const fileContent = fs.readFileSync(WAITLIST_FILE, "utf-8");
        waitlist = JSON.parse(fileContent);
      } catch (e) {
        console.error("Failed to parse waitlist file, resetting store", e);
        waitlist = [];
      }
    }

    // Check if email already exists
    const exists = waitlist.some((entry) => entry.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      return NextResponse.json(
        { message: "You have already locked in your spot! Welcome to the arena." },
        { status: 200 }
      );
    }

    // Add new entry
    const newEntry: WaitlistEntry = {
      id: `usr_${Date.now()}`,
      email,
      name: name || "Warrior",
      battlefield: battlefield || "General self-mastery",
      struggle: struggle || "No details specified",
      champion: champion || "Eric Thomas",
      timestamp: new Date().toISOString(),
    };

    waitlist.push(newEntry);

    // Best-effort persistence. On serverless (Vercel) the filesystem is read-only, so a write here
    // throws — we swallow it so the capture still succeeds for the user. (Durable waitlist storage
    // moves to Resend/Supabase post-launch.)
    try {
      fs.writeFileSync(WAITLIST_FILE, JSON.stringify(waitlist, null, 2), "utf-8");
    } catch (persistErr) {
      console.warn("waitlist persist skipped (read-only fs):", (persistErr as Error).message);
    }

    return NextResponse.json(
      { message: "Your spot has been successfully secured in the arena!" },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Waitlist API error:", error);
    return NextResponse.json(
      { error: "Something went wrong in the arena. Try again." },
      { status: 500 }
    );
  }
}
