// src/utils/upiQrDecode.ts
// Best-effort decoder: given an uploaded QR image, reads the UPI payload the
// bank printed and returns what the tenant's payment settings need from it:
//   · org_id, mcc   — the merchant-classification fields a bank encodes on a
//                     real UPI merchant QR (a merchant VPA paid as a
//                     personal/P2P transfer is refused by the UPI network —
//                     see CLAUDE.md, "check-in UPI pay link fails on real GPay");
//   · upi_id, payee_name — the VPA and name on the QR, so the form can fill
//                     them when empty and warn when they disagree.
// The tenant only ever uploads the QR they already have from their bank.
//
// Real uploads are phone photos of a printed sticker (a bank logo in the
// middle, uneven light). jsQR reads those only after some preparation, so a
// short list of preparations is tried in order and the first that decodes
// wins. Verified against BBB's own Karnataka Bank sticker photo, which the
// raw pass alone does NOT decode.
//
// Deliberately never throws: this only ever enriches an otherwise
// successful QR image upload. A non-UPI QR, an undecodable image, or a
// personal VPA's QR (no orgid/mc) are normal outcomes, not errors — the
// upload itself must never be blocked by this.
import Jimp from 'jimp';
import jsQR from 'jsqr';

export interface DetectedUpiFields {
  org_id?: string;
  mcc?: string;
  upi_id?: string;
  payee_name?: string;
}

// Large phone photos are slow to scan and decode no better; cap the long side.
const MAX_SIDE = 1600;

const PREPARATIONS: Array<(img: Jimp) => Jimp> = [
  (img) => img,
  (img) => img.greyscale().contrast(0.5),
  (img) => img.scale(0.5).greyscale().contrast(0.4),
  (img) => img.greyscale().contrast(0.6).posterize(2),
  (img) => img.scale(1.5).greyscale(),
];

function scan(img: Jimp): string | null {
  const { data, width, height } = img.bitmap;
  const code = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height, {
    inversionAttempts: 'attemptBoth',
  });
  return code?.data ? code.data.trim() : null;
}

export async function detectUpiMerchantFields(buffer: Buffer): Promise<DetectedUpiFields | null> {
  try {
    const base = await Jimp.read(buffer);
    const longSide = Math.max(base.bitmap.width, base.bitmap.height);
    if (longSide > MAX_SIDE) base.scale(MAX_SIDE / longSide);

    let text: string | null = null;
    for (const prepare of PREPARATIONS) {
      text = scan(prepare(base.clone()));
      if (text) break;
    }
    if (!text || !/^upi:\/\//i.test(text)) return null;

    const queryString = text.split('?')[1];
    if (!queryString) return null;

    const params = new URLSearchParams(queryString);
    const found: DetectedUpiFields = {};
    const orgId = params.get('orgid');
    const mcc = params.get('mc');
    const upiId = params.get('pa');
    const payee = params.get('pn');
    // mc=0000 declares a personal (P2P) payee — not a merchant; storing it
    // would switch the check-in page to the merchant flow for a personal VPA.
    if (mcc && mcc !== '0000') {
      if (orgId) found.org_id = orgId;
      found.mcc = mcc;
    }
    if (upiId) found.upi_id = upiId.trim();
    if (payee) found.payee_name = payee.replace(/\s+/g, ' ').trim();

    return Object.keys(found).length > 0 ? found : null;
  } catch (error) {
    console.warn('QR merchant-field detection failed (non-fatal):', error instanceof Error ? error.message : error);
    return null;
  }
}
