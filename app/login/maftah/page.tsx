import { Suspense } from "react"
import { notFound } from "next/navigation"
import { getNexoraMaftahExposureMode } from "@/lib/auth/config"
import { PilotLoginClient } from "./pilot-client"

export const dynamic = "force-dynamic"

export default function MaftahPilotLoginPage() {
  const exposureMode = getNexoraMaftahExposureMode()

  // Fail closed: return 404 when exposure is hidden
  if (exposureMode === "hidden") {
    notFound()
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-xs text-slate-400">Loading...</div>}>
      <PilotLoginClient />
    </Suspense>
  )
}
