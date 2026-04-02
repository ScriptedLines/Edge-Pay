import re

src = r"d:\Python Projects\AI-ML\paytm-pppo\Edge-pay\inference_results.txt"
dst = r"d:\Python Projects\AI-ML\paytm-pppo\Edge-pay\check.txt"

txt = open(src, encoding="utf-8").read()
out = open(dst, "w", encoding="utf-8")

for block in re.split(r"={5,}", txt):
    if "ACCOUNT" not in block:
        continue

    def g(pat):
        m = re.search(pat, block)
        return m.group(1).strip() if m else "N/A"

    cold = "COLD START" in block
    out.write("ACCOUNT: "   + g(r"ACCOUNT\s*:\s*(.+)") + "\n")
    out.write("TRUST:    "  + g(r"XGBoost Trust Score\s*=\s*([\d\.]+)") + " / 1.0\n")
    out.write("GRU_RISK: "  + g(r"TFLite GRU Risk Score\s*=\s*([\d\.]+)") + " / 1.0\n")
    out.write("DRAIN:    "  + g(r"balance_drain_ratio\s*=\s*([\d\.]+)") + "\n")
    out.write("LATE_NGT: "  + g(r"late_night_ratio\s*=\s*([\d\.]+)") + "\n")
    out.write("FREQ_SPIKE: "+ g(r"freq_spike_ratio\s*=\s*([\d\.]+)") + "\n")
    out.write("REPEAT_RX:  "+ g(r"repeat_recv_ratio\s*=\s*([\d\.]+)") + "\n")
    out.write("ALLOWANCE:  "+ g(r"allowanceRate\s*=\s*([^\n]+)") + "\n")
    out.write("COMBINED:   "+ g(r"combinedTrust\s*=\s*([^\n]+)") + "\n")

    if cold:
        out.write("LIMITS:  COLD START -- offline LOCKED (tx_count < 10)\n")
    else:
        for ln in block.splitlines():
            if "T+" in ln and "Rs." in ln:
                out.write("  " + ln.strip() + "\n")

    out.write("\n")

out.close()
print("Written:", dst)
