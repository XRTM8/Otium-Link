/**
 * Otium Link — Local Sensitive Data & Credential Shield
 * Protects users from unintentionally broadcasting API keys, private keys, credit cards, or DB secrets.
 */

export interface SensitiveDetectionResult {
  isSensitive: boolean;
  category: 'api_key' | 'private_key' | 'credit_card' | 'db_credentials' | 'none';
  labelArabic: string;
}

export function detectSensitiveContent(text: string): SensitiveDetectionResult {
  if (!text || typeof text !== 'string') {
    return { isSensitive: false, category: 'none', labelArabic: '' };
  }

  const trimmed = text.trim();

  // 1. Private Cryptographic Keys
  if (
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/i.test(trimmed)
  ) {
    return {
      isSensitive: true,
      category: 'private_key',
      labelArabic: 'مفتاح تشفير سري (Private Key)',
    };
  }

  // 2. High-profile API Tokens (OpenAI, GitHub, AWS, Slack, Google)
  if (
    /\b(?:sk-[a-zA-Z0-9]{24,}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|xoxb-[0-9]{10,}-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z\-_]{35})\b/.test(
      trimmed
    )
  ) {
    return {
      isSensitive: true,
      category: 'api_key',
      labelArabic: 'مفتاح برمجي سري (API Key / Token)',
    };
  }

  // 3. Database Connection URIs with credentials
  if (
    /\b(?:postgres|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s]+:[^@\s]+@[^/\s]+/i.test(
      trimmed
    )
  ) {
    return {
      isSensitive: true,
      category: 'db_credentials',
      labelArabic: 'بيانات اتصال قاعدة بيانات مع كلمة السر',
    };
  }

  // 4. Credit Card Numbers (13-19 digits with Luhn verification)
  const ccCandidate = trimmed.replace(/[\s-]/g, '');
  if (/^\d{13,19}$/.test(ccCandidate) && isLuhnValid(ccCandidate)) {
    return {
      isSensitive: true,
      category: 'credit_card',
      labelArabic: 'رقم بطاقة بنكية (Credit Card)',
    };
  }

  return { isSensitive: false, category: 'none', labelArabic: '' };
}

/**
 * Standard Luhn Algorithm for validating payment card numbers
 */
function isLuhnValid(digits: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits.charAt(i), 10);
    if (Number.isNaN(n)) return false;
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}
