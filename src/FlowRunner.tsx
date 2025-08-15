import React, { useEffect, useMemo, useRef } from "react";
import { createMachine, createActor, type AnyActorRef } from "xstate";
import { createBrowserInspector } from "@statelyai/inspect";

// ==================== Types ====================
export type StateName = string;
export type FlowSpec = { name: StateName; to: StateName[]; terminal?: boolean };
export type EdgeEvent = { type: `TO_${string}` };
export type FlowEvent = EdgeEvent;

export type FlowRunnerProps = {
  specs: readonly FlowSpec[];  // first entry = initial
  name?: string;               // machine id
  showInspector?: boolean;     // embed inspector panel (default true)
};

// ==================== Machine Builder ====================
export function createFlowMachine(specs: readonly FlowSpec[], id = "runtimeFlow") {
  if (!specs.length) throw new Error("specs cannot be empty");

  const names = specs.map((s) => s.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) console.error(`[FlowRunner] Duplicate state name: '${dup}'.`);

  const byName = new Map(specs.map((s) => [s.name, s] as const));

  const states: Record<string, any> = Object.fromEntries(
    specs.map((s) => {
      // one explicit event per edge — no guards; clean graph
      const on = Object.fromEntries(s.to.map((t) => [`TO_${t}`, { target: t }]));
      for (const t of s.to) if (!byName.has(t)) console.error(`[FlowRunner] Unknown target '${t}' from '${s.name}'.`);
      return [s.name, s.terminal ? { type: "final" } : { on }];
    })
  );

  return createMachine<{}, FlowEvent>({ id, initial: specs[0].name, states });
}

// ==================== Runner (stable, no flicker) ====================
export default function FlowRunner({ specs, name = "runtimeFlow", showInspector = true }: FlowRunnerProps) {
  const actorRef = useRef<AnyActorRef | null>(null);
  const inspectorRef = useRef<ReturnType<typeof createBrowserInspector> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const machine = useMemo(() => createFlowMachine(specs, name), [specs, name]);

  // Start WITHOUT inspector (only if inspector is disabled)
  useEffect(() => {
    if (!specs?.length) return;
    if (actorRef.current) return;            // already started
    if (showInspector) return;               // wait for iframe path below

    const actor = createActor(machine);
    actorRef.current = actor;
    actor.start();
    (window as any).flow = actor as AnyActorRef;

    return () => {
      if ((window as any).flow === actor) delete (window as any).flow;
      actor.stop();
      actorRef.current = null;
    };
  }, [specs, machine, showInspector]);

  // Start WITH inspector (one-time, once iframe exists). No onload listeners, no reattach loops.
  useEffect(() => {
    if (!showInspector) return;
    if (!specs?.length) return;
    if (actorRef.current) return;            // already started
    const iframe = iframeRef.current;
    if (!iframe) return;                     // will run on next render when iframe mounts

    try {
      inspectorRef.current = createBrowserInspector({ iframe, url: "https://stately.ai/inspect" });
    } catch (err) {
      console.warn("[FlowRunner] Could not initialize embedded inspector:", err);
    }

    const actor = inspectorRef.current
      ? createActor(machine, { inspect: inspectorRef.current.inspect })
      : createActor(machine);

    actorRef.current = actor;
    actor.start();
    (window as any).flow = actor as AnyActorRef;

    return () => {
      inspectorRef.current?.stop?.();
      if ((window as any).flow === actor) delete (window as any).flow;
      actor.stop();
      actorRef.current = null;
    };
  }, [specs, machine, showInspector]);

  return (
    <div className="FlowRunner-root" style={{ display: "grid", gap: 12 }}>
      <div className="FlowRunner-hint">Flow machine is running with {specs?.length ?? 0} states.</div>
      {showInspector && (
        <div style={{ width: 1200, height: 520, border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
          <iframe
          tabIndex={0}
            ref={iframeRef}
            title="Stately Inspector"
            src="https://stately.ai/inspect"
            style={{ width: "100%", height: "100%", border: 0 }}
            // keep this minimal; no onload wiring to avoid reattach loops
            allow="clipboard-read; clipboard-write;"
          />
        </div>
      )}
    </div>
  );
}
