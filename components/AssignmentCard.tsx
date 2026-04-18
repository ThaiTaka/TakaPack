"use client";

import { useEffect, useState } from "react";
import { Check, PencilLine, Sparkles } from "lucide-react";

interface AssignmentCardProps {
  assigneeName: string;
  role: string;
  tasks: string[];
  onRoleChange: (newRole: string) => void;
  isTaskDone: (taskIndex: number) => boolean;
  onToggleTask: (taskIndex: number) => void;
  animationDelayMs?: number;
}

export default function AssignmentCard({
  assigneeName,
  role,
  tasks,
  onRoleChange,
  isTaskDone,
  onToggleTask,
  animationDelayMs = 0
}: AssignmentCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [roleDraft, setRoleDraft] = useState(role);

  useEffect(() => {
    setRoleDraft(role);
  }, [role]);

  const handleSaveRole = () => {
    const normalized = roleDraft.trim();
    if (normalized) {
      onRoleChange(normalized);
    } else {
      setRoleDraft(role);
    }
    setIsEditing(false);
  };

  return (
    <article
      className="card-stagger-enter rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm backdrop-blur-xl transition hover:border-cyan-400/40"
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
          {assigneeName}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        {isEditing ? (
          <input
            className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm font-medium text-slate-100 focus:border-cyan-400"
            value={roleDraft}
            onChange={(event) => setRoleDraft(event.target.value)}
            onBlur={handleSaveRole}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSaveRole();
              }
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 text-left text-base font-semibold text-slate-100"
          >
            <span>{role}</span>
            <PencilLine className="h-4 w-4 text-violet-300" />
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {tasks.map((task, index) => (
          <li key={`${task}-${index}`} className="flex items-start gap-2 text-sm text-slate-300">
            <label className="mt-0.5 inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={isTaskDone(index)}
                onChange={() => onToggleTask(index)}
                className="peer sr-only"
              />
              <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-slate-500/70 bg-slate-900/60 peer-checked:border-cyan-400 peer-checked:bg-cyan-400/80">
                <Check className="h-3 w-3 text-slate-950" />
              </span>
            </label>
            <span className={isTaskDone(index) ? "text-slate-400 line-through" : ""}>{task}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
