import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = (body.text || body.intent || "").toLowerCase();

    // Mock an artificial API delay to simulate "AI processing" and heavy NLP
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const actions = [];
    
    // Super-basic tokenization: intelligently split multiple compound requests
    const segments = text.split(/\band\b/);

    for (const segment of segments) {
      // Extract amount robustly
      const amountMatch = segment.match(/\d+(,\d+)*(\.\d+)?/);
      const amount = amountMatch ? parseInt(amountMatch[0].replace(/,/g, "")) : 0;
      
      if (amount === 0) continue;

      let type = "pay";
      let title = "Payment";
      let target = "Merchant";
      let icon = "wifi"; // Map to default Action Receipt Card 

      if (segment.includes("split")) {
        type = "split";
        title = "Split Expense";
        icon = "users";
        // Look for: "split dinner with Rahul"
        const targetMatch = segment.match(/split(?:.*?)with\s+([a-zA-Z]+)/);
        if (targetMatch && targetMatch[1]) target = targetMatch[1];
        else target = "Friends";
      } 
      else if (segment.includes("book") || segment.includes("ticket") || segment.includes("flight") || segment.includes("train")) {
        type = "book";
        title = "Book Tickets";
        icon = "card"; // mapped to ticket ui internally
        // Look for: "book flight to Delhi"
        const targetMatch = segment.match(/(?:to|for)\s+([a-zA-Z]+)/);
        if (targetMatch && targetMatch[1]) target = targetMatch[1];
        else target = "Travel";
      } 
      else if (segment.includes("send")) {
        type = "send";
        title = "Send Money";
        icon = "zap";
        // Look for: "send 500 to Amit"
        const targetMatch = segment.match(/to\s+([a-zA-Z]+)/);
        if (targetMatch && targetMatch[1]) target = targetMatch[1];
        else target = "Contact";
      } 
      else {
        // Fallback "Pay" heuristics
        type = "pay";
        title = "Pay Bill";
        icon = "wifi";
        // Look for "Pay Airtel 999" or "Pay the cafe 500"
        const words = segment.replace(/the/gi, "").trim().split(/\s+/);
        const payIndex = words.findIndex((w: string) => w === "pay");
        if (payIndex !== -1 && words[payIndex + 1]) {
           const potentialTarget = words[payIndex + 1];
           if (!/\d/.test(potentialTarget)) {
              target = potentialTarget;
           }
        }
      }

      // Formatting polish
      target = target.charAt(0).toUpperCase() + target.slice(1);

      actions.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `local-nlp-${Date.now()}-${Math.random()}`,
        type,
        title,
        target,
        amount,
        icon
      });
    }

    if (actions.length === 0) {
       return NextResponse.json({ error: "No financial amounts detected." }, { status: 422 });
    }

    return NextResponse.json({ actions });
  } catch (error) {
    return NextResponse.json({ error: "Zero-UI Local Parser Error." }, { status: 500 });
  }
}
