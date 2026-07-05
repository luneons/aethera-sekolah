import api, { type Envelope } from './api';

export interface TwoFAStatus {
  enabled: boolean;
  has_recovery_codes: boolean;
  recovery_codes_remaining: number;
}

export interface SetupInitOut {
  secret: string;
  qr_uri: string;
  qr_png_url: string;  // data: URL
}

export async function fetch2FAStatus() {
  const r = await api.get<Envelope<TwoFAStatus>>('/2fa/status');
  return r.data.data!;
}

export async function setup2FAInit() {
  const r = await api.post<Envelope<SetupInitOut>>('/2fa/setup-init', {});
  return r.data.data!;
}

export async function setup2FAVerify(code: string) {
  const r = await api.post<Envelope<{ enabled: boolean; recovery_codes: string[] }>>(
    '/2fa/setup-verify',
    { code }
  );
  return r.data.data!;
}

export async function disable2FA(password: string, code: string) {
  const r = await api.post<Envelope<{ enabled: boolean }>>(
    '/2fa/disable',
    { password, code }
  );
  return r.data.data!;
}

export async function regenerateRecoveryCodes() {
  const r = await api.post<Envelope<{ recovery_codes: string[] }>>(
    '/2fa/recovery-regenerate',
    {}
  );
  return r.data.data!;
}

// Login flow with 2FA
export async function loginWith2FA(challengeToken: string, code: string, useRecovery = false) {
  const r = await api.post<Envelope<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id: number;
  }>>('/auth/login-2fa', {
    challenge_token: challengeToken,
    code,
    use_recovery: useRecovery,
  });
  return r.data.data!;
}
