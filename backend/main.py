"""
Paytm Zero-UI Intent Engine — FastAPI Backend
Universal NLP Router: financial | navigate | action | invalid
"""

from __future__ import annotations

import json
import os
import uuid
from typing import Literal, Optional

import google.generativeai as genai
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ── Environment ────────────────────────────────────────────────────────────────
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
if not GEMINI_API_KEY or GEMINI_API_KEY == "your_key_here":
    raise RuntimeError(
        "GEMINI_API_KEY is not set. "
        "Add it to backend/.env before starting the server."
    )

genai.configure(api_key=GEMINI_API_KEY)

# ── Pydantic Models ────────────────────────────────────────────────────────────

class IntentAction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: Literal["split", "pay", "book", "send"]
    title: str
    target: str
    amount: int
    icon: str = ""
    upiId: Optional[str] = None
    targetCount: Optional[int] = None   # for split: how many people total (incl. user)

    def model_post_init(self, __context: object) -> None:
        icon_map = {"split": "Users", "pay": "Wifi", "book": "Ticket", "send": "Send"}
        if not self.icon:
            self.icon = icon_map.get(self.type, "CreditCard")


class IntentResponse(BaseModel):
    # Routing category
    category: Literal["financial", "navigate", "action", "invalid"] = "financial"
    # financial actions list
    actions: list[IntentAction] = []
    # navigate: which UI target to open
    ui_target: Optional[str] = None
    # action: which command to execute
    command: Optional[str] = None
    # invalid: human-readable reason
    error_message: Optional[str] = None


class ParseRequest(BaseModel):
    intent: str


# ── FastAPI App ────────────────────────────────────────────────────────────────
app = FastAPI(title="Paytm Intent Engine", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Gemini Model ───────────────────────────────────────────────────────────────
SYSTEM_INSTRUCTION = """
You are the Universal NLP Router for a Paytm fintech mobile application.
You control the ENTIRE app through natural language commands.

## Your 4 Categories

### 1. financial
Triggered when the user wants to: pay, split, send money, book tickets, transfer to bank.
Output: category="financial", populate actions[] with:
- type: "pay" | "split" | "book" | "send"
- title: short human-readable title (≤ 5 words)
- target: the recipient/biller name
- amount: integer INR amount (0 if not stated)
- upiId: UPI ID if mentioned (e.g., "user@ptsbi"), else null
- targetCount: ONLY for "split" type — the TOTAL number of people including the user (e.g., "between 3 people" → targetCount: 3)

### 2. navigate
Triggered when the user asks to VIEW or GO TO a section of the app.
Examples: "show my balance", "open history", "check my transactions", "where is the QR scanner", "view my profile"
Output: category="navigate", ui_target from this list:
- "history_sheet" — for balance, transaction history, account details
- "profile_sheet" — for profile, settings, account info
- "notifications_sheet" — for notifications, alerts
- "scan_qr" — for QR scanner, scan to pay
- "pay_anyone" — for paying a contact, send money
- "bank_transfer" — for bank account transfer, NEFT, IMPS

### 3. action
Triggered when the user wants to CHANGE a setting or EXECUTE a toggle.
Examples: "turn on dark mode", "switch to light theme", "mute soundbox", "toggle theme"
Output: category="action", command from this list:
- "toggle_dark_mode" — enable dark mode
- "toggle_light_mode" — enable light mode
- "toggle_theme" — flip current theme
- "mute_soundbox" — silence the soundbox audio

### 4. invalid
Triggered when the request is outside Paytm's scope (ordering food, weather, translations, etc.)
Output: category="invalid", error_message explaining what Paytm CAN do instead.

## Rules
- Return ONLY valid JSON — no markdown, no explanation.
- Generate a fresh UUID for each action id.
- Always include the category field.
- For non-financial categories, actions[] can be empty.
"""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {
            "type": "string",
            "enum": ["financial", "navigate", "action", "invalid"]
        },
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id":          {"type": "string"},
                    "type":        {"type": "string", "enum": ["split", "pay", "book", "send"]},
                    "title":       {"type": "string"},
                    "target":      {"type": "string"},
                    "amount":      {"type": "integer"},
                    "icon":        {"type": "string"},
                    "upiId":       {"type": "string"},
                    "targetCount": {"type": "integer"},
                },
                "required": ["id", "type", "title", "target", "amount", "icon"],
            },
        },
        "ui_target":     {"type": "string"},
        "command":       {"type": "string"},
        "error_message": {"type": "string"},
    },
    "required": ["category"],
}

gemini_model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    system_instruction=SYSTEM_INSTRUCTION,
)

# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.post("/api/parse", response_model=IntentResponse)
async def parse_intent(request: ParseRequest) -> IntentResponse:
    if not request.intent.strip():
        raise HTTPException(status_code=422, detail="Intent text cannot be empty.")

    try:
        response = gemini_model.generate_content(
            request.intent,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=RESPONSE_SCHEMA,
                temperature=0.1,
            ),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {exc}") from exc

    try:
        raw: dict = json.loads(response.text)
        result = IntentResponse(**raw)
        for action in result.actions:
            if not action.icon:
                icon_map = {"split": "Users", "pay": "Wifi", "book": "Ticket", "send": "Send"}
                action.icon = icon_map.get(action.type, "CreditCard")
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to parse Gemini response: {exc}\nRaw: {response.text}",
        ) from exc

    return result


@app.get("/")
async def root():
    return {
        "message": "Paytm Universal Intent Engine v2.0 is running! 🚀",
        "interactive_docs": "Visit http://localhost:8000/docs to test the API directly."
    }


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model": "gemini-2.0-flash", "version": "2.0"}
