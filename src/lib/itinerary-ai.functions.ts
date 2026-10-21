import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractItinerary } from "./itinerary-ai.server";
import { spendAiQuota } from "./ai-quota.server";

export const analyzeTripPlan = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => z.object({tripId:z.string().uuid(),destination:z.string().max(120),startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),endDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),text:z.string().max(20000).optional(),mime:z.enum(["application/pdf","image/png","image/jpeg","image/webp"]).optional(),base64:z.string().max(11000000).optional(),filename:z.string().max(150).optional()}).refine(v=>Boolean(v.text?.trim()||v.base64),"Add a file or paste your plan").parse(value))
  .handler(async ({data,context}) => {
    const {data:membership,error} = await context.supabase.from("trip_members").select("role").eq("trip_id",data.tripId).eq("user_id",context.userId).eq("status","approved").maybeSingle();
    if (error || !membership || !["captain","co_captain"].includes(membership.role)) throw new Error("Only trip leaders can add the itinerary.");
    const { data: trip } = await context.supabase.from("trips").select("destination,start_date,end_date").eq("id",data.tripId).single();
    if (!trip) throw new Error("Trip unavailable");
    const log = await spendAiQuota(context.supabase, "itinerary", data.tripId);
    return extractItinerary({ ...data, destination: trip.destination, startDate: trip.start_date, endDate: trip.end_date }, log);
  });
