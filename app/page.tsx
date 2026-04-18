import { TentTree } from "lucide-react";
import TripPlanner from "@/components/TripPlanner";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-8 md:px-8">
      <div className="pointer-events-none absolute -left-20 top-10 h-52 w-52 rounded-full bg-cyan-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <header className="flex items-center gap-3">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-cyan-400/25 to-violet-500/25 shadow-[0_0_20px_rgba(139,92,246,0.35)] backdrop-blur-xl">
            <TentTree className="h-5 w-5 text-cyan-200" />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-2xl font-semibold text-transparent">
              TakaPack
            </h1>
            <p className="text-sm text-slate-400">AI chia task nhóm theo ngữ cảnh chuyến đi</p>
          </div>
        </header>

        <TripPlanner />
      </div>
    </main>
  );
}
