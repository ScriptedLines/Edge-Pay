let extractor: any = null;
let intentVectors: { id: string; category: string; vector: number[] }[] = [];

// Pre-defined app intents to match against (Vector DB)
const INTENTS = [
    { id: "split", category: "financial", text: "split the bill, divide the cost between friends, share the payment, group tab" },
    { id: "pay", category: "financial", text: "send money, pay the merchant, transfer funds, scan qr code, give money" },
    { id: "history", category: "navigate", text: "check my balance, show past transactions, view my account history, how much money do i have" },
    { id: "theme", category: "action", text: "turn on dark mode, change theme, enable light mode, switch visual appearance" },
    { id: "unrelated", category: "invalid", text: "order a pizza, tell me the weather, translate spanish, call a cab, what time is it" }
];

// Cosine Similarity Algorithm
function cosineSimilarity(a: number[], b: number[]) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Simple local parameter extractor
function extractParams(text: string, intentId: string) {
    const amountMatch = text.match(/\b\d+(,\d+)*(\.\d+)?\b/);
    const amount = amountMatch ? parseInt(amountMatch[0].replace(/,/g, "")) : 0;

    let targetCount;
    if (intentId === "split") {
        const countMatch = text.match(/\b([2-9]|two|three|four|five|six|seven|eight|nine)\s+(?:people|persons|friends)\b/i);
        const map: Record<string, number> = { "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9 };
        if (countMatch && countMatch[1]) {
            const val = countMatch[1].toLowerCase();
            targetCount = map[val] || parseInt(val);
        }
    }
    return { amount, targetCount };
}

export async function initMLModel() {
    if (extractor) return; // already init
    console.log("Initializing Transformers.js inside browser...");
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    intentVectors = [];
    for (const intent of INTENTS) {
        const out = await extractor(intent.text, { pooling: 'mean', normalize: true });
        intentVectors.push({ id: intent.id, category: intent.category, vector: Array.from(out.data) });
    }
    console.log("ML Model fully loaded and vectors mounted.");
}

export async function predictIntent(text: string) {
    if (!extractor || intentVectors.length === 0) {
        await initMLModel();
    }

    const out = await extractor(text, { pooling: 'mean', normalize: true });
    const inputVec = Array.from(out.data) as number[];

    let bestIntent = intentVectors[0];
    let bestScore = -1;

    for (const intent of intentVectors) {
        const score = cosineSimilarity(inputVec, intent.vector);
        if (score > bestScore) {
            bestScore = score;
            bestIntent = intent;
        }
    }

    const params = extractParams(text, bestIntent.id);

    return {
        intentId: bestIntent.id,
        category: bestIntent.category,
        score: bestScore,
        text,
        params
    };
}
