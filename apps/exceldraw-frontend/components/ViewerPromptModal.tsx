"use client";

import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { User, ArrowRight } from "lucide-react";
import axios from "axios";
import { BACKEND_URL } from "@repo/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { viewerKeys } from "../lib/queryKeys";
import { useUIStore } from "../store/uiStore";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const viewerSchema = z.object({
  name: z.string().optional(),
});

type ViewerFormValues = z.infer<typeof viewerSchema>;

export function ViewerPromptModal({
  roomId,
  onJoin
}: {
  roomId: string;
  onJoin?: () => void;
}) {
  const queryClient = useQueryClient();
  const isViewerPromptOpen = useUIStore(s => s.isViewerPromptOpen);
  const setViewerPromptOpen = useUIStore(s => s.setViewerPromptOpen);

  const { register, handleSubmit } = useForm<ViewerFormValues>({
    resolver: zodResolver(viewerSchema),
    defaultValues: { name: "" }
  });

  const joinMutation = useMutation({
    mutationFn: async (data: ViewerFormValues) => {
      await axios.post(`${BACKEND_URL}/room/${roomId}/viewers`, {
        name: data.name?.trim() || "Guest"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: viewerKeys.room(roomId)
      });
    },
    onSettled: () => {
      // Regardless of success or failure, we close the modal and let them view
      if (typeof window !== "undefined") {
        localStorage.setItem(`guest_${roomId}`, "true");
      }
      setViewerPromptOpen(false);
      onJoin?.();
    }
  });

  const onSubmit = (data: ViewerFormValues) => {
    joinMutation.mutate(data);
  };

  return (
    <Dialog open={isViewerPromptOpen} onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="sm:max-w-[420px] bg-[#0A0A0B] border-purple-500/20 text-white p-0 overflow-hidden shadow-2xl rounded-2xl">
        <div className="p-6 pt-8 flex flex-col gap-6 relative">
          
          <div className="flex flex-col gap-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">
              View Drawing
            </h2>
            <p className="text-sm text-gray-400">
              You&apos;ve been invited to view this drawing. Enter your name below to join.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-300 font-medium">Your name (optional)</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input 
                  placeholder="e.g. Alice" 
                  className="pl-9" 
                  {...register("name")}
                />
              </div>
            </div>

            <Button type="submit" className="w-full mt-2 font-medium" disabled={joinMutation.isPending}>
              {joinMutation.isPending ? "Joining..." : "Join as Viewer"}
              {!joinMutation.isPending && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
