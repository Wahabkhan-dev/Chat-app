"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Lock, Mail, Loader2, ArrowLeft, MailCheck } from 'lucide-react';
import Image from 'next/image';
import { BRAND_LOGO_URL, BRAND_LOGO_DARK_URL } from '@/lib/brand';
import { initiateLogin, verifyOTP, resendOTP } from '@/services/auth';
import { subscribePushDevice } from '@/lib/pushSubscribe';
import { cn } from '@/lib/utils';

const SignInPage: React.FC = () => {
  const { dispatch } = useAppContext();

  // ── Step: credentials or otp ──────────────────────────────────────────────
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');

  // Credentials step state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [credError, setCredError] = useState<string | null>(null);
  const [credLoading, setCredLoading] = useState(false);

  // OTP step state
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [resendTrigger, setResendTrigger] = useState(0);

  // Ref to prevent double-submit from auto-submit
  const verifyingRef = useRef(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'otp') return;
    setCountdown(60);
    setCanResend(false);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setCanResend(true);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, resendTrigger]);

  // Focus first OTP box when entering OTP step
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => inputRefs.current[0]?.focus(), 120);
    }
  }, [step]);

  // ── Credentials submit ────────────────────────────────────────────────────
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredError(null);
    setCredLoading(true);

    try {
      const result = await initiateLogin(email.trim(), password);
      if (result.requiresOTP) {
        setMaskedEmail(result.maskedEmail);
        setOtp(['', '', '', '', '', '']);
        setOtpError(null);
        setStep('otp');
      }
    } catch (err: unknown) {
      setCredError(err instanceof Error ? err.message : 'Invalid email or password.');
    } finally {
      setCredLoading(false);
    }
  };

  // ── OTP digit handlers ────────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setOtpError(null);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (!verifyingRef.current && newOtp.every((d) => d !== '') && newOtp.join('').length === 6) {
      handleVerify(newOtp.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 0) return;
    const newOtp = [...Array(6).fill('')];
    text.split('').forEach((d, i) => { newOtp[i] = d; });
    setOtp(newOtp);
    setOtpError(null);

    const focusIndex = Math.min(text.length, 5);
    inputRefs.current[focusIndex]?.focus();

    if (!verifyingRef.current && text.length === 6) {
      handleVerify(text);
    }
  };

  // ── OTP verification ──────────────────────────────────────────────────────
  const handleVerify = async (code?: string) => {
    const otpCode = code ?? otp.join('');
    if (otpCode.length !== 6) return;
    if (verifyingRef.current) return;

    verifyingRef.current = true;
    setVerifying(true);
    setOtpError(null);

    try {
      const user = await verifyOTP(email.trim(), otpCode);

      dispatch({
        type: 'LOGIN',
        payload: {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar || '',
          status: user.status,
          department: user.department,
          isActive: user.is_active === 1,
        },
      });

      // Immediately subscribe this device — bypassCache forces the backend POST even if
      // the endpoint was previously cached, guaranteeing a fresh DB row after every login.
      subscribePushDevice(String(user.id), { bypassCache: true }).catch(() => {});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setOtpError(message);
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 60);

      if (message.includes('expired') || message.includes('Too many')) {
        setTimeout(() => {
          setStep('credentials');
          setOtpError(null);
        }, 2500);
      }
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (!canResend || resending) return;
    setResending(true);
    setOtpError(null);

    try {
      await resendOTP(email.trim());
      setOtp(['', '', '', '', '', '']);
      setResendSuccess(true);
      setResendTrigger((prev) => prev + 1);
      setTimeout(() => setResendSuccess(false), 3000);
      setTimeout(() => inputRefs.current[0]?.focus(), 60);
    } catch (err: unknown) {
      setOtpError(err instanceof Error ? err.message : 'Failed to resend OTP.');
    } finally {
      setResending(false);
    }
  };

  const handleBackToLogin = () => {
    setStep('credentials');
    setOtp(['', '', '', '', '', '']);
    setOtpError(null);
    setResendSuccess(false);
    setPassword('');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-background relative overflow-hidden transition-colors duration-300">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-l from-primary/5 to-transparent rounded-full -mr-48 -mt-48 blur-3xl" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-r from-secondary/5 to-transparent rounded-full -ml-32 -mb-32 blur-3xl" />

      {/* ── Credentials form ── */}
      <div className="relative z-10 w-full max-w-md px-6 flex flex-col items-center">
        <div className="bg-card p-8 md:p-10 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-border/50 w-full flex flex-col items-center max-h-[95vh] overflow-y-auto scrollbar-hide">
          <div className="flex flex-col items-center mb-10 w-full">
            <div className="relative overflow-hidden rounded-[32px] w-full max-w-[220px] h-[90px] bg-transparent">
              <Image src={BRAND_LOGO_URL} alt="Mawby Technologies logo" fill className="object-contain dark:hidden" />
              <Image src={BRAND_LOGO_DARK_URL} alt="Mawby Technologies logo" fill className="object-contain hidden dark:block" />
            </div>
            <p className="text-muted-foreground text-sm mt-1.5 font-medium text-center opacity-80">Sign in to your enterprise workspace</p>
          </div>

          <form onSubmit={handleSignIn} className="w-full space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground ml-1">Work Email</Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/50" />
                <Input
                  id="email"
                  type="email"
                  placeholder="name@mawbytec.com"
                  className="pl-12 h-14 text-sm bg-muted/20 border-transparent focus:bg-background focus:border-primary/30 transition-all rounded-2xl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={credLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground ml-1">Password</Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/50" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="pl-12 pr-12 h-14 text-sm bg-muted/20 border-transparent focus:bg-background focus:border-primary/30 transition-all rounded-2xl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={credLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {credError && (
              <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-xl border border-destructive/20 animate-in fade-in slide-in-from-top-1 text-center font-bold">
                {credError}
              </div>
            )}

            <Button
              type="submit"
              disabled={credLoading}
              className="w-full bg-primary hover:bg-primary/90 text-white h-14 text-base font-bold rounded-2xl transition-all shadow-lg shadow-primary/20 active:scale-[0.98]"
            >
              {credLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Sending OTP...
                </span>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
        </div>

        <div className="mt-8 text-center text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] opacity-50">
          © {new Date().getFullYear()} Mawby Technologies Teams
        </div>
      </div>

      {/* ── OTP Modal Overlay ── */}
      {step === 'otp' && (
        <div className="fixed inset-0 z-50 flex md:items-center justify-center">
          {/* Blurred backdrop — not clickable (no onClose) */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

          {/* Modal card */}
          <div className={cn(
            'relative z-10 bg-card flex flex-col',
            // Mobile: full screen, no radius
            'w-full h-full',
            // Desktop: centered card with radius
            'md:h-auto md:max-w-[420px] md:mx-4 md:rounded-[32px] md:shadow-[0_32px_80px_rgba(0,0,0,0.2)] md:border md:border-border/50',
            'overflow-y-auto scrollbar-hide',
          )}>
            <div className="flex flex-col items-center justify-center flex-1 p-8 md:p-10">

              {/* Icon */}
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <MailCheck className="h-8 w-8 text-primary" />
              </div>

              {/* Heading */}
              <h2 className="text-2xl font-bold font-headline text-foreground mb-2 text-center">Check Your Email</h2>
              <p className="text-sm text-muted-foreground text-center mb-2 leading-relaxed">
                We sent a 6-digit verification code to
              </p>
              <p className="text-sm font-bold text-foreground text-center mb-8 tracking-wide">
                {maskedEmail}
              </p>

              {/* 6-digit OTP input boxes */}
              <div className="flex gap-2 sm:gap-3 mb-6" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    disabled={verifying}
                    className={cn(
                      'w-11 h-14 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-2xl border-2 bg-muted/30 outline-none transition-all',
                      'focus:border-primary focus:bg-background focus:scale-105',
                      otpError
                        ? 'border-destructive/60 bg-destructive/5'
                        : digit
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border',
                      verifying && 'opacity-50 cursor-not-allowed',
                      // Minimum 48px tap target enforced by fixed width/height
                    )}
                    style={{ minWidth: '44px', minHeight: '48px' }}
                    autoComplete="one-time-code"
                  />
                ))}
              </div>

              {/* Error message */}
              {otpError && (
                <div className="w-full bg-destructive/10 text-destructive text-xs p-3 rounded-xl border border-destructive/20 animate-in fade-in slide-in-from-top-1 text-center font-bold mb-4">
                  {otpError}
                </div>
              )}

              {/* Resend success */}
              {resendSuccess && !otpError && (
                <div className="w-full bg-green-500/10 text-green-700 dark:text-green-400 text-xs p-3 rounded-xl border border-green-500/20 animate-in fade-in text-center font-bold mb-4">
                  New OTP sent! Check your email.
                </div>
              )}

              {/* Verify button */}
              <Button
                onClick={() => handleVerify()}
                disabled={verifying || otp.join('').length !== 6}
                className="w-full bg-primary hover:bg-primary/90 text-white h-14 text-base font-bold rounded-2xl transition-all shadow-lg shadow-primary/20 active:scale-[0.98] mb-4"
              >
                {verifying ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Verifying...
                  </span>
                ) : (
                  'Verify Code'
                )}
              </Button>

              {/* Resend button with countdown */}
              <button
                type="button"
                onClick={handleResend}
                disabled={!canResend || resending || verifying}
                className={cn(
                  'text-sm font-bold transition-all mb-3',
                  canResend && !resending && !verifying
                    ? 'text-primary hover:underline cursor-pointer'
                    : 'text-muted-foreground cursor-not-allowed',
                )}
              >
                {resending ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sending...
                  </span>
                ) : canResend ? (
                  'Resend OTP'
                ) : (
                  `Resend OTP (${countdown}s)`
                )}
              </button>

              {/* Back to login */}
              <button
                type="button"
                onClick={handleBackToLogin}
                disabled={verifying}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Login
              </button>

              <p className="text-[10px] text-muted-foreground text-center mt-8 leading-relaxed opacity-60">
                Code expires in 10 minutes. Do not share it with anyone.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SignInPage;
