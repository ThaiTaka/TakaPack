"use client";

import { useEffect, useMemo, useState } from "react";
import { experimental_useObject as useObject } from "ai/react";
import { z } from "zod";
import {
  AlertTriangle,
  Bot,
  Download,
  Loader2,
  RotateCcw,
  Shuffle,
  Sparkles,
  Users
} from "lucide-react";
import type { TripPlan } from "@/app/types";
import AssignmentCard from "@/components/AssignmentCard";
import { trackClientEvent } from "@/lib/analytics";

const STORAGE_KEYS = {
  prompt: "takapack.prompt",
  members: "takapack.members",
  contextOverride: "takapack.contextOverride",
  planningMode: "takapack.planningMode",
  plan: "takapack.plan",
  completed: "takapack.completed"
} as const;

const CONTEXT_OVERRIDE_OPTIONS = [
  { value: "auto", label: "Tự động nhận diện" },
  { value: "charity", label: "Thiện nguyện/Từ thiện" },
  { value: "farewell", label: "Tiệc chia tay" },
  { value: "home-party", label: "Tiệc tại nhà" },
  { value: "outdoor", label: "Outdoor/Cắm trại" },
  { value: "celebration", label: "Tiệc/Kỷ niệm" },
  { value: "workshop", label: "Workshop/Hội thảo" },
  { value: "community", label: "Sự kiện cộng đồng" },
  { value: "generic", label: "Sự kiện tổng quát" }
] as const;

const CONTEXT_LABEL_MAP = Object.fromEntries(
  CONTEXT_OVERRIDE_OPTIONS.map((option) => [option.value, option.label])
) as Record<string, string>;

const PLANNING_MODE_OPTIONS = [
  { value: "simple", label: "Đơn giản" },
  { value: "normal", label: "Bình thường" },
  { value: "complex", label: "Phức tạp (chi tiết cao)" }
] as const;

const PLANNING_MODE_LABEL_MAP = Object.fromEntries(
  PLANNING_MODE_OPTIONS.map((option) => [option.value, option.label])
) as Record<string, string>;

const PROMPT_PRESETS = [
  "BBQ tại nhà tối thứ 7, 8 người, cần setup sân thượng và dọn dẹp nhanh",
  "Cắm trại rừng thông 2 ngày 1 đêm, có trekking nhẹ và nấu ăn ngoài trời",
  "Đi biển cuối tuần 3 ngày, có tiệc tối và hoạt động team-building"
] as const;

const tripPlanSchema = z.object({
  eventName: z.string(),
  contextAnalysis: z.string(),
  detectedEventType: z.string().optional(),
  planningMode: z.enum(["simple", "normal", "complex"]).optional(),
  assignments: z.array(
    z.object({
      assigneeName: z.string(),
      role: z.string(),
      tasks: z.array(z.string()).min(2).max(6)
    })
  )
});

function shuffleArray<T>(items: T[]): T[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[randomIndex]] = [next[randomIndex], next[index]];
  }
  return next;
}

function randomSwapAssignments(plan: TripPlan): TripPlan {
  const allTasks = shuffleArray(plan.assignments.flatMap((assignment) => assignment.tasks));
  let cursor = 0;

  const assignments = plan.assignments.map((assignment) => {
    const taskCount = assignment.tasks.length;
    const reassignedTasks = allTasks.slice(cursor, cursor + taskCount);
    cursor += taskCount;

    return {
      ...assignment,
      tasks: reassignedTasks
    };
  });

  return {
    ...plan,
    assignments
  };
}

function isCompletePlan(value: unknown): value is TripPlan {
  const parsed = tripPlanSchema.safeParse(value);
  return parsed.success;
}

function getMemberSkeletonCount(memberNamesInput: string): number {
  const names = memberNamesInput
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (names.length === 0) {
    return 3;
  }

  return Math.min(Math.max(names.length, 1), 12);
}

function AssignmentSkeletonCard() {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-xl">
      <div className="mb-3 h-6 w-24 animate-pulse rounded-full bg-white/10" />
      <div className="mb-4 h-5 w-2/3 animate-pulse rounded bg-white/10" />
      <div className="space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-white/10" />
        <div className="h-4 w-11/12 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-10/12 animate-pulse rounded bg-white/10" />
      </div>
    </article>
  );
}

export default function TripPlanner() {
  const [prompt, setPrompt] = useState("");
  const [memberNamesInput, setMemberNamesInput] = useState("Taka, Nhi, Nam, Huy");
  const [contextOverride, setContextOverride] = useState<(typeof CONTEXT_OVERRIDE_OPTIONS)[number]["value"]>("auto");
  const [planningMode, setPlanningMode] = useState<(typeof PLANNING_MODE_OPTIONS)[number]["value"]>("normal");
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({});

  const {
    object: streamedObject,
    submit,
    isLoading,
    error: streamError
  } = useObject<TripPlan>({
    api: "/api/trip-plan",
    schema: tripPlanSchema
  });

  useEffect(() => {
    if (!isLoading && streamedObject && isCompletePlan(streamedObject)) {
      setPlan(streamedObject);
      trackClientEvent({
        eventName: "plan_generated",
        metadata: {
          assignments: streamedObject.assignments.length,
          eventName: streamedObject.eventName,
          planningMode: streamedObject.planningMode ?? planningMode
        }
      });
    }
  }, [isLoading, streamedObject, planningMode]);

  useEffect(() => {
    try {
      const storedPrompt = localStorage.getItem(STORAGE_KEYS.prompt);
      const storedMembers = localStorage.getItem(STORAGE_KEYS.members);
      const storedContextOverride = localStorage.getItem(STORAGE_KEYS.contextOverride);
      const storedPlanningMode = localStorage.getItem(STORAGE_KEYS.planningMode);
      const storedPlan = localStorage.getItem(STORAGE_KEYS.plan);
      const storedCompleted = localStorage.getItem(STORAGE_KEYS.completed);

      if (storedPrompt) {
        setPrompt(storedPrompt);
      }

      if (storedMembers) {
        setMemberNamesInput(storedMembers);
      }

      if (
        storedContextOverride &&
        CONTEXT_OVERRIDE_OPTIONS.some((option) => option.value === storedContextOverride)
      ) {
        setContextOverride(storedContextOverride as (typeof CONTEXT_OVERRIDE_OPTIONS)[number]["value"]);
      }

      if (
        storedPlanningMode &&
        PLANNING_MODE_OPTIONS.some((option) => option.value === storedPlanningMode)
      ) {
        setPlanningMode(storedPlanningMode as (typeof PLANNING_MODE_OPTIONS)[number]["value"]);
      }

      if (storedPlan) {
        const parsedPlan = JSON.parse(storedPlan) as unknown;
        if (isCompletePlan(parsedPlan)) {
          setPlan(parsedPlan);
        }
      }

      if (storedCompleted) {
        const parsedCompleted = JSON.parse(storedCompleted) as Record<string, boolean>;
        setCompletedTasks(parsedCompleted);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEYS.plan);
      localStorage.removeItem(STORAGE_KEYS.completed);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.prompt, prompt);
  }, [prompt]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.members, memberNamesInput);
  }, [memberNamesInput]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.contextOverride, contextOverride);
  }, [contextOverride]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.planningMode, planningMode);
  }, [planningMode]);

  useEffect(() => {
    if (!plan) {
      return;
    }
    localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify(plan));
  }, [plan]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.completed, JSON.stringify(completedTasks));
  }, [completedTasks]);

  useEffect(() => {
    if (streamError) {
      setError(streamError.message || "Có lỗi xảy ra khi phân tích kế hoạch. Vui lòng thử lại.");
      return;
    }
    setError(null);
  }, [streamError]);

  const canSubmit = useMemo(() => {
    return prompt.trim().length > 0 && memberNamesInput.trim().length > 0 && !isLoading;
  }, [prompt, memberNamesInput, isLoading]);

  const previewPlan = useMemo(() => {
    if (!streamedObject) {
      return null;
    }

    if (isCompletePlan(streamedObject)) {
      return streamedObject;
    }

    const candidate = streamedObject as Partial<TripPlan>;
    return {
      eventName: candidate.eventName ?? "AI đang tạo tiêu đề chuyến đi...",
      contextAnalysis: candidate.contextAnalysis ?? "AI đang phân tích bối cảnh sự kiện...",
      assignments: Array.isArray(candidate.assignments)
        ? candidate.assignments
            .map((item, index) => ({
              assigneeName: item?.assigneeName || `Thành viên ${index + 1}`,
              role: item?.role || "Đang đề xuất vai trò...",
              tasks: Array.isArray(item?.tasks)
                ? item.tasks.filter((task): task is string => typeof task === "string")
                : []
            }))
            .filter((item) => item.assigneeName || item.role || item.tasks.length > 0)
        : []
    };
  }, [streamedObject]);

  const displayPlan = isLoading ? previewPlan : plan;
  const skeletonCount = useMemo(() => getMemberSkeletonCount(memberNamesInput), [memberNamesInput]);

  const totalTasks = useMemo(() => {
    if (!displayPlan) {
      return 0;
    }

    return displayPlan.assignments.reduce((count, assignment) => count + assignment.tasks.length, 0);
  }, [displayPlan]);

  const completedCount = useMemo(() => {
    if (!displayPlan) {
      return 0;
    }

    return displayPlan.assignments.reduce((count, assignment) => {
      return (
        count +
        assignment.tasks.filter((_, taskIndex) => {
          const key = `${assignment.assigneeName}::${taskIndex}`;
          return Boolean(completedTasks[key]);
        }).length
      );
    }, 0);
  }, [completedTasks, displayPlan]);

  const completionPercent = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  const updateRole = (index: number, newRole: string) => {
    setPlan((current) => {
      if (!current) return current;
      const nextAssignments = [...current.assignments];
      nextAssignments[index] = {
        ...nextAssignments[index],
        role: newRole
      };

      return {
        ...current,
        assignments: nextAssignments
      };
    });
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPlan(null);
    setCompletedTasks({});
    trackClientEvent({
      eventName: "plan_submit",
      metadata: {
        memberCount: memberNamesInput.split(",").map((item) => item.trim()).filter(Boolean).length,
        contextOverride,
        planningMode
      }
    });
    submit({ prompt, memberNamesInput, overrideContextKind: contextOverride, planningMode });
  };

  const handleToggleTask = (assigneeName: string, taskIndex: number) => {
    const taskKey = `${assigneeName}::${taskIndex}`;
    setCompletedTasks((current) => ({
      ...current,
      [taskKey]: !current[taskKey]
    }));
  };

  const handleResetAll = () => {
    setPrompt("");
    setMemberNamesInput("");
    setPlanningMode("normal");
    setPlan(null);
    setCompletedTasks({});
    setError(null);

    localStorage.removeItem(STORAGE_KEYS.prompt);
    localStorage.removeItem(STORAGE_KEYS.members);
    localStorage.removeItem(STORAGE_KEYS.contextOverride);
    localStorage.removeItem(STORAGE_KEYS.planningMode);
    localStorage.removeItem(STORAGE_KEYS.plan);
    localStorage.removeItem(STORAGE_KEYS.completed);

    trackClientEvent({ eventName: "planner_reset" });
  };

  const handleExportJson = () => {
    if (!plan) {
      return;
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      completionPercent,
      completedTasks,
      plan
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "takapack-trip-plan.json";
    anchor.click();
    URL.revokeObjectURL(url);

    trackClientEvent({
      eventName: "plan_export_json",
      metadata: {
        completionPercent,
        assignmentCount: plan.assignments.length
      }
    });
  };

  const handleRandomSwapTasks = () => {
    setPlan((current) => {
      if (!current) {
        return current;
      }

      const swapped = randomSwapAssignments(current);
      trackClientEvent({
        eventName: "plan_random_swap",
        metadata: {
          assignmentCount: swapped.assignments.length,
          planningMode: swapped.planningMode ?? planningMode
        }
      });
      return swapped;
    });
    setCompletedTasks({});
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-sm backdrop-blur-xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="trip-prompt" className="block text-sm font-medium text-slate-200">
              Nhập kế hoạch chuyến đi của bạn (VD: Săn mây đồi Đa Phú 2 ngày 1 đêm, có làm đồ nướng)...
            </label>
            <textarea
              id="trip-prompt"
              className="min-h-36 w-full resize-y rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400"
              placeholder="Mô tả lịch trình, hoạt động chính, món ăn dự kiến, thời gian..."
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />

            <div className="flex flex-wrap gap-2 pt-1">
              {PROMPT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setPrompt(preset)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="member-names" className="block text-sm font-medium text-slate-200">
              Tên các thành viên (cách nhau bằng dấu phẩy)
            </label>
            <div className="relative">
              <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300" />
              <input
                id="member-names"
                type="text"
                className="w-full rounded-xl border border-white/10 bg-slate-900/70 py-3 pl-10 pr-4 text-sm text-slate-100 focus:border-cyan-400"
                value={memberNamesInput}
                onChange={(event) => setMemberNamesInput(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="context-override" className="block text-sm font-medium text-slate-200">
              Chế độ nhận diện sự kiện
            </label>
            <select
              id="context-override"
              value={contextOverride}
              onChange={(event) =>
                setContextOverride(event.target.value as (typeof CONTEXT_OVERRIDE_OPTIONS)[number]["value"])
              }
              className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 focus:border-cyan-400"
            >
              {CONTEXT_OVERRIDE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-slate-900 text-slate-100">
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="planning-mode" className="block text-sm font-medium text-slate-200">
              Độ chi tiết kế hoạch
            </label>
            <select
              id="planning-mode"
              value={planningMode}
              onChange={(event) =>
                setPlanningMode(event.target.value as (typeof PLANNING_MODE_OPTIONS)[number]["value"])
              }
              className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 focus:border-cyan-400"
            >
              {PLANNING_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-slate-900 text-slate-100">
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_0_25px_rgba(56,189,248,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Phân tích & Chia Task
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              disabled={!plan}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export JSON
            </button>

            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-violet-400/40 hover:text-violet-200"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>

            <button
              type="button"
              onClick={handleRandomSwapTasks}
              disabled={!plan}
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-amber-400/40 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Shuffle className="h-4 w-4" />
              Tráo việc random
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : null}
      </form>

      {isLoading ? (
        <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
          <Bot className="h-4 w-4" />
          AI đang phân tích ngữ cảnh và phân task realtime...
        </div>
      ) : null}

      {displayPlan ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-100">{displayPlan.eventName}</h2>
              <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" />
                {completedCount}/{totalTasks} hoàn thành ({completionPercent}%)
              </div>
            </div>
            <div className="mt-2 inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">
              Event Type: {CONTEXT_LABEL_MAP[displayPlan.detectedEventType ?? "auto"] ?? (displayPlan.detectedEventType ?? "auto")}
            </div>
            <div className="ml-2 mt-2 inline-flex items-center rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs text-violet-200">
              Mode: {PLANNING_MODE_LABEL_MAP[displayPlan.planningMode ?? planningMode] ?? (displayPlan.planningMode ?? planningMode)}
            </div>
            <p className="mt-2 text-sm text-slate-300">{displayPlan.contextAnalysis}</p>

            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800/80">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all duration-300"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {displayPlan.assignments.map((assignment, index) => (
              <AssignmentCard
                key={`${assignment.assigneeName}-${index}`}
                assigneeName={assignment.assigneeName}
                role={assignment.role}
                tasks={assignment.tasks}
                onRoleChange={(newRole) => updateRole(index, newRole)}
                isTaskDone={(taskIndex) => Boolean(completedTasks[`${assignment.assigneeName}::${taskIndex}`])}
                onToggleTask={(taskIndex) => handleToggleTask(assignment.assigneeName, taskIndex)}
                animationDelayMs={index * 80}
              />
            ))}

            {isLoading &&
              Array.from({ length: Math.max(skeletonCount - displayPlan.assignments.length, 0) }).map(
                (_, index) => <AssignmentSkeletonCard key={`skeleton-${index}`} />
              )}
          </div>
        </section>
      ) : null}

      {!displayPlan && isLoading ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-xl">
            <div className="h-6 w-2/3 animate-pulse rounded bg-white/10" />
            <div className="mt-3 h-4 w-full animate-pulse rounded bg-white/10" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: skeletonCount }).map((_, index) => (
              <AssignmentSkeletonCard key={`only-skeleton-${index}`} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
