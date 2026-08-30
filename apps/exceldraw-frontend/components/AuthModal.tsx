"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Cloud, Users, Folder } from "lucide-react";
import axios from "axios";
import { BACKEND_URL } from "@repo/shared";
import { useMutation } from "@tanstack/react-query";
import { useUIStore } from "../store/uiStore";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const authSchema = z.object({
  email: z.string().email("Invalid email address"),
  username: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().optional()
}).refine((data) => {
  if (data.confirmPassword !== undefined) {
    return data.password === data.confirmPassword;
  }
  return true;
}, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

type AuthFormValues = z.infer<typeof authSchema>;

function FeatureRow({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-white">{title}</span>
        <span className="text-xs text-gray-400">{desc}</span>
      </div>
    </div>
  );
}

export function AuthModal() {
  const isAuthOpen = useUIStore(s => s.isAuthOpen);
  const setAuthOpen = useUIStore(s => s.setAuthOpen);
  const authMode = useUIStore(s => s.authMode);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      username: "",
      password: "",
      confirmPassword: ""
    }
  });

  const signinMutation = useMutation({
    mutationFn: async (data: AuthFormValues) => {
      const res = await axios.post(`${BACKEND_URL}/signin`, {
        username: data.email,
        password: data.password
      });
      return res.data;
    },
    onSuccess: (data) => {
      localStorage.setItem("token", data.token);
      setAuthOpen(false);
      reset();
      window.location.reload();
    },
    onError: (error: import("axios").AxiosError<{ msg: string }>) => {
      alert(error.response?.data?.msg || "Something went wrong during sign in");
    }
  });

  const signupMutation = useMutation({
    mutationFn: async (data: AuthFormValues) => {
      const res = await axios.post(`${BACKEND_URL}/signup`, {
        email: data.email,
        username: data.username || data.email,
        password: data.password
      });
      return res.data;
    },
    onSuccess: () => {
      setAuthOpen(true, "signin");
    },
    onError: (error: import("axios").AxiosError<{ msg: string }>) => {
      alert(error.response?.data?.msg || "Something went wrong during sign up");
    }
  });

  const onSubmit = (data: AuthFormValues) => {
    if (authMode === "signin") {
      signinMutation.mutate(data);
    } else {
      signupMutation.mutate(data);
    }
  };

  const isPending = signinMutation.isPending || signupMutation.isPending;

  return (
    <Dialog open={isAuthOpen} onOpenChange={(isOpen) => setAuthOpen(isOpen)}>
      <DialogContent className="sm:max-w-[850px] bg-[#121212] border-white/10 text-white p-0 overflow-hidden shadow-2xl rounded-2xl flex flex-col md:flex-row gap-0">
        
        {/* LEFT COLUMN */}
        <div className="w-full md:w-[400px] bg-[#0A0A0B] p-8 flex flex-col border-r border-white/5">
          <div className="flex items-center gap-2 mb-8">
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-[#9b66ff]" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4L20 20M20 4L4 20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-lg font-bold tracking-tight">Excaldraw</span>
          </div>

          <div className="flex flex-col gap-2 mb-8">
            <h2 className="text-2xl font-semibold tracking-tight">
              {authMode === "signin" ? "Welcome back! 👋" : "Create your account 👋"}
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              {authMode === "signin" 
                ? "Sign in to continue to your workspace" 
                : "Join Excaldraw and start creating beautiful diagrams."}
            </p>
          </div>

          {/* Abstract Illustration */}
          <div className="relative w-full h-40 bg-[#111115] rounded-xl border border-white/5 flex items-center justify-center mb-8 overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent"></div>
            <div className="flex gap-6 items-center">
              <div className="w-14 h-14 border border-purple-400/40 rounded-sm rotate-6 transition-transform duration-500 group-hover:-rotate-6 bg-purple-500/10"></div>
              <div className="w-14 h-14 border border-blue-400/40 rounded-full -rotate-12 transition-transform duration-500 group-hover:rotate-12 bg-blue-500/10"></div>
            </div>
            <div className="absolute bottom-4 right-4 text-purple-400/50 animate-pulse">✨</div>
          </div>

          <div className="flex flex-col gap-5 mt-auto">
            {authMode === "signin" ? (
              <>
                <FeatureRow icon={<Cloud className="w-4 h-4 text-[#9b66ff]" />} title="Access your drawings anywhere" desc="Your work is synced and secure" />
                <FeatureRow icon={<Users className="w-4 h-4 text-[#9b66ff]" />} title="Collaborate in real time" desc="Work together with your team" />
                <FeatureRow icon={<Folder className="w-4 h-4 text-[#9b66ff]" />} title="Keep everything organized" desc="Folders, templates and favorites" />
              </>
            ) : (
              <>
                <FeatureRow icon={<User className="w-4 h-4 text-[#9b66ff]" />} title="Create without limits" desc="Unlimited drawings and canvases" />
                <FeatureRow icon={<Cloud className="w-4 h-4 text-[#9b66ff]" />} title="Access anywhere" desc="Your work is saved in the cloud" />
                <FeatureRow icon={<Users className="w-4 h-4 text-[#9b66ff]" />} title="Collaborate in real time" desc="Work together seamlessly" />
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="w-full md:w-[450px] p-8 flex flex-col justify-center bg-[#121212]">
          
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-100 mb-1">
              {authMode === "signin" ? "Sign in to Excaldraw" : "Sign up to Excaldraw"}
            </h2>
            {authMode === "signup" && (
              <p className="text-sm text-gray-400">
                Already have an account?{" "}
                <button type="button" onClick={() => { setAuthOpen(true, "signin"); reset(); }} className="text-[#9b66ff] hover:text-purple-400 transition-colors">
                  Sign in
                </button>
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {authMode === "signup" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-300 font-medium">Full name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input 
                    placeholder="Enter your full name" 
                    className="pl-9 bg-[#1a1a1a] border-white/5 focus-visible:ring-[#9b66ff]/50" 
                    {...register("username")}
                  />
                </div>
                {errors.username && <span className="text-red-500 text-xs">{errors.username.message}</span>}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-300 font-medium">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input 
                  type="email" 
                  placeholder="you@example.com" 
                  className="pl-9 bg-[#1a1a1a] border-white/5 focus-visible:ring-[#9b66ff]/50" 
                  {...register("email")}
                />
              </div>
              {errors.email && <span className="text-red-500 text-xs">{errors.email.message}</span>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-300 font-medium">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input 
                  type={showPassword ? "text" : "password"} 
                  placeholder={authMode === "signin" ? "Enter your password" : "Create a password"} 
                  className="pl-9 pr-9 bg-[#1a1a1a] border-white/5 focus-visible:ring-[#9b66ff]/50" 
                  {...register("password")}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <span className="text-red-500 text-xs">{errors.password.message}</span>}
            </div>

            {authMode === "signup" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-300 font-medium">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input 
                    type={showConfirmPassword ? "text" : "password"} 
                    placeholder="Confirm your password" 
                    className="pl-9 pr-9 bg-[#1a1a1a] border-white/5 focus-visible:ring-[#9b66ff]/50" 
                    {...register("confirmPassword")}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.confirmPassword && <span className="text-red-500 text-xs">{errors.confirmPassword.message}</span>}
              </div>
            )}

            {authMode === "signin" && (
              <div className="flex justify-end mt-1">
                <button type="button" className="text-xs text-[#9b66ff] hover:text-purple-400 transition-colors">
                  Forgot password?
                </button>
              </div>
            )}

            <Button type="submit" className="w-full mt-2 font-medium bg-[#7950f2] hover:bg-[#6741d9] text-white" disabled={isPending}>
              {isPending ? "Loading..." : authMode === "signin" ? "Sign in" : "Create account"} 
              {!isPending && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </form>

          <div className="relative flex items-center py-5">
            <div className="flex-grow border-t border-white/10"></div>
            <span className="flex-shrink-0 mx-4 text-xs text-gray-500">
              or continue with
            </span>
            <div className="flex-grow border-t border-white/10"></div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Button variant="outline" className="w-full font-normal text-xs py-5 bg-[#1a1a1a] border-white/5 hover:bg-white/5">Google</Button>
            <Button variant="outline" className="w-full font-normal text-xs py-5 bg-[#1a1a1a] border-white/5 hover:bg-white/5">GitHub</Button>
            <Button variant="outline" className="w-full font-normal text-xs py-5 bg-[#1a1a1a] border-white/5 hover:bg-white/5">Microsoft</Button>
          </div>

          {authMode === "signin" ? (
            <div className="text-center text-sm text-gray-400 mt-8">
              Don&apos;t have an account?{" "}
              <button onClick={() => { setAuthOpen(true, "signup"); reset(); }} type="button" className="text-[#9b66ff] hover:text-purple-400 transition-colors">
                Sign up
              </button>
            </div>
          ) : (
            <div className="text-center text-xs text-gray-500 mt-8">
              By signing up, you agree to our{" "}
              <span className="text-[#9b66ff] cursor-pointer hover:text-purple-400">Terms of Service</span>
              {" "}and{" "}
              <span className="text-[#9b66ff] cursor-pointer hover:text-purple-400">Privacy Policy</span>.
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
