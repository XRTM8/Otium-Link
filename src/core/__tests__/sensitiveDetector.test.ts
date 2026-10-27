import { describe, it, expect } from 'vitest';
import { detectSensitiveContent } from '../sensitiveDetector';

describe('Local Sensitive Data & Credential Shield', () => {
  it('detects private cryptographic keys', () => {
    const rsaKey = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
    const res = detectSensitiveContent(rsaKey);
    expect(res.isSensitive).toBe(true);
    expect(res.category).toBe('private_key');
  });

  it('detects OpenAI and GitHub API keys', () => {
    const openai = 'sk-1234567890abcdef1234567890abcdef';
    const res1 = detectSensitiveContent(openai);
    expect(res1.isSensitive).toBe(true);
    expect(res1.category).toBe('api_key');

    const github = 'ghp_1234567890abcdef1234567890abcdef1234';
    const res2 = detectSensitiveContent(github);
    expect(res2.isSensitive).toBe(true);
    expect(res2.category).toBe('api_key');
  });

  it('detects database credentials in connection strings', () => {
    const dbUrl = 'postgres://postgres:SuperSecretP@ss@db.internal.net:5432/main';
    const res = detectSensitiveContent(dbUrl);
    expect(res.isSensitive).toBe(true);
    expect(res.category).toBe('db_credentials');
  });

  it('detects valid credit card numbers via Luhn', () => {
    // Valid Luhn test card numbers
    const validVisa = '4012-8888-8888-1881';
    const res = detectSensitiveContent(validVisa);
    expect(res.isSensitive).toBe(true);
    expect(res.category).toBe('credit_card');
  });

  it('does not flag normal text, URLs, or code without secrets', () => {
    expect(detectSensitiveContent('مرحباً بك في أوتيوم').isSensitive).toBe(false);
    expect(detectSensitiveContent('https://youtu.be/dQw4w9WgXcQ').isSensitive).toBe(false);
    expect(detectSensitiveContent('const x = 42;').isSensitive).toBe(false);
  });
});
