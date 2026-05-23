'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { loginAction } from '@/lib/auth/actions';
import { motion } from 'framer-motion';

import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Schema Zod
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Komponen
// ---------------------------------------------------------------------------

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);

    const result = await loginAction({
      email: values.email,
      password: values.password,
    });

    if (result.error) {
      setServerError(result.error);
      return;
    }

    router.push('/app/dashboard');
    router.refresh();
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#111315] px-4 font-sans antialiased">
      {/* Brand Logo Container */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="mb-8 text-center flex flex-col gap-2"
      >
        <h2 className="text-3xl font-bold tracking-tight text-[#e8eaed]">
          STITCHLYX<span className="text-[#e5c17b]">.SYNCORE</span>
        </h2>
        <p className="text-[#9aa0a6] text-sm">Sign in to your account</p>
      </motion.div>

      {/* Login Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <Card className="bg-[#1A1D1F]/80 backdrop-blur-lg border border-[#2A2D31] shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold text-[#e8eaed]">
              Login
            </CardTitle>
            <CardDescription className="text-[#5f6368]">
              Masukkan kredensial Anda untuk mengakses sistem
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              {/* Email */}
              <div className="space-y-2">
                <Label
                  htmlFor="email"
                  className="text-sm font-medium text-[#e8eaed]"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nama@email.com"
                  disabled={isSubmitting}
                  className="bg-[#1E2124] border-[#2A2D31] text-[#e8eaed] placeholder:text-[#5f6368] 
                             focus-visible:ring-1 focus-visible:ring-[#e5c17b] focus-visible:border-[#e5c17b]"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-xs text-[#e65c5c] mt-1">{errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="password"
                    className="text-sm font-medium text-[#e8eaed]"
                  >
                    Password
                  </Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={isSubmitting}
                  className="bg-[#1E2124] border-[#2A2D31] text-[#e8eaed] placeholder:text-[#5f6368] 
                             focus-visible:ring-1 focus-visible:ring-[#e5c17b] focus-visible:border-[#e5c17b]"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-xs text-[#e65c5c] mt-1">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Server error */}
              {serverError && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-lg bg-[#e65c5c]/10 border border-[#e65c5c]/30 px-4 py-3"
                >
                  <p className="text-sm text-[#e65c5c]">{serverError}</p>
                </motion.div>
              )}

              {/* Submit */}
              <Button
                id="btn-login"
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#e5c17b] text-[#2b2318] hover:bg-[#e5c17b]/90 
                           font-semibold shadow-[0_0_15px_rgba(229,193,123,0.15)] 
                           transition-all duration-200 mt-2"
              >
                {isSubmitting ? 'Memproses...' : 'Masuk ke Sistem'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}
