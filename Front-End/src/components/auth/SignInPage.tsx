"use client";

import React, { useState } from 'react';
import { useAppContext } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Lock, Mail, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { BRAND_LOGO_URL, BRAND_LOGO_DARK_URL } from '@/lib/brand';
import { loginUser } from '@/services/auth';

const SignInPage: React.FC = () => {
  const { dispatch } = useAppContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const user = await loginUser(email.trim(), password);
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-background relative overflow-hidden transition-colors duration-300">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-l from-primary/5 to-transparent rounded-full -mr-48 -mt-48 blur-3xl" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-r from-secondary/5 to-transparent rounded-full -ml-32 -mb-32 blur-3xl" />

      <div className="relative z-10 w-full max-w-md px-6 flex flex-col items-center">
        <div className="bg-card p-8 md:p-10 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.05)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-border/50 w-full flex flex-col items-center max-h-[95vh] overflow-y-auto scrollbar-hide">
          <div className="flex flex-col items-center mb-10 w-full">
            <div className="relative overflow-hidden rounded-[32px] w-full max-w-[220px] h-[90px] bg-transparent">
              <Image
                src={BRAND_LOGO_URL}
                alt="Mawby Technologies logo"
                fill
                className="object-contain dark:hidden"
              />
              <Image
                src={BRAND_LOGO_DARK_URL}
                alt="Mawby Technologies logo"
                fill
                className="object-contain hidden dark:block"
              />
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
                  disabled={loading}
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
                  disabled={loading}
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

            {error && (
              <div className="bg-destructive/10 text-destructive text-xs p-3 rounded-xl border border-destructive/20 animate-in fade-in slide-in-from-top-1 text-center font-bold">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90 text-white h-14 text-base font-bold rounded-2xl transition-all shadow-lg shadow-primary/20 active:scale-[0.98]"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing in...
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
    </div>
  );
};

export default SignInPage;
