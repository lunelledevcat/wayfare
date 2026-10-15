"use client";

import { Scanner } from "@yudiel/react-qr-scanner";

/** Camera QR scanner. Imported with next/dynamic (ssr: false) so the decoder only loads when opened. */
export default function QrScanner({ onResult, onError, paused }: { onResult: (text: string) => void; onError: (message: string) => void; paused?: boolean }) {
  return (
    <Scanner
      onScan={(codes) => {
        const text = codes[0]?.rawValue;
        if (text) onResult(text);
      }}
      onError={(e) => onError(e.message)}
      formats={["qr_code"]}
      paused={paused}
      constraints={{ facingMode: "environment" }}
      sound={false}
      classNames={{ container: "overflow-hidden rounded-2xl" }}
    />
  );
}
