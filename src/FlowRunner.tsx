import React, { useEffect, useMemo, useRef, useState } from "react";
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

// ==================== Helpers ====================
function norm(s: string) {
  return (s ?? "").trim();
}

function normalizeSpecs(specs: readonly FlowSpec[]): FlowSpec[] {
  return specs.map((s) => ({
    name: norm(s.name),
    terminal: !!s.terminal,
    to: (s.to ?? []).map(norm),
  }));
}

// ==================== Machine Builder ====================
export function createFlowMachine(inputSpecs: readonly FlowSpec[], id = "runtimeFlow") {
  const specs = normalizeSpecs(inputSpecs);
  if (!specs.length) throw new Error("specs cannot be empty");

  // Uniqueness
  const names = specs.map((s) => s.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`[FlowRunner] Duplicate state name: '${dup}'.`);

  const byName = new Map(specs.map((s) => [s.name, s] as const));

  // Validate all targets exist BEFORE building machine
  const missing: string[] = [];
  for (const s of specs) {
    for (const t of s.to) {
      if (!byName.has(t)) missing.push(`'${s.name}' -> '${t}'`);
    }
  }
  if (missing.length) {
    throw new Error(
      `[FlowRunner] Undefined target state(s): ${missing.join(
        ", "
      )}.\nEvery 'to' must reference a state that exists in specs (check spelling/casing/whitespace).`
    );
  }

  const states: Record<string, any> = Object.fromEntries(
    specs.map((s) => {
      const on = Object.fromEntries(s.to.map((t) => [`TO_${t}`, { target: t }]));
      return [s.name, s.terminal ? { type: "final" } : { on }];
    })
  );

  return createMachine<{}, FlowEvent>({ id, initial: specs[0].name, states });
}

// ==================== Runner (iframe + side controls; no flicker) ====================
export default function FlowRunner({ specs: rawSpecs, name = "runtimeFlow", showInspector = true }: FlowRunnerProps) {
  const specs = useMemo(() => normalizeSpecs(rawSpecs), [rawSpecs]);
  const actorRef = useRef<AnyActorRef | null>(null);
  const inspectorRef = useRef<ReturnType<typeof createBrowserInspector> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [current, setCurrent] = useState<string>(specs[0]?.name ?? "");

  const machine = useMemo(() => createFlowMachine(specs, name), [specs, name]);

  // Start WITHOUT inspector (if disabled)
  useEffect(() => {
    if (!specs?.length || showInspector) return;
    if (actorRef.current) return;
    const actor = createActor(machine);
    actorRef.current = actor;
    const sub = actor.subscribe((snap) => setCurrent(String(snap.value)));
    actor.start();
    (window as any).flow = actor as AnyActorRef;
    return () => {
      sub.unsubscribe?.();
      if ((window as any).flow === actor) delete (window as any).flow;
      actor.stop();
      actorRef.current = null;
    };
  }, [specs, machine, showInspector]);

  // Start WITH inspector once iframe exists (no onload listeners, no re-create)
  useEffect(() => {
    if (!specs?.length || !showInspector) return;
    if (actorRef.current) return;

    let raf = 0;
    const attach = () => {
      const iframe = iframeRef.current;
      if (!iframe) { raf = requestAnimationFrame(attach); return; }
      try {
        inspectorRef.current = createBrowserInspector({ iframe, url: "https://stately.ai/inspect" });
        const actor = createActor(machine, { inspect: inspectorRef.current.inspect });
        actorRef.current = actor;
        const sub = actor.subscribe((snap) => setCurrent(String(snap.value)));
        actor.start();
        (window as any).flow = actor as AnyActorRef;
        (actor as any).__cleanup = () => sub.unsubscribe?.();
      } catch (err) {
        console.warn("[FlowRunner] Could not initialize embedded inspector:", err);
        const actor = createActor(machine);
        actorRef.current = actor;
        const sub = actor.subscribe((snap) => setCurrent(String(snap.value)));
        actor.start();
        (window as any).flow = actor as AnyActorRef;
        (actor as any).__cleanup = () => sub.unsubscribe?.();
      }
    };
    raf = requestAnimationFrame(attach);
    return () => cancelAnimationFrame(raf);
  }, [specs, machine, showInspector]);

  // Helper to send TO_<target>
  const sendTo = (target: string) => {
    actorRef.current?.send?.({ type: `TO_${target}` });
  };

  const currentSpec = specs.find((s) => s.name === current);

  return (
    <div className="FlowRunner-root" style={{ display: "grid", gridTemplateColumns: showInspector ? "320px 1fr" : "1fr", alignItems: "start", gap: 12 }}>
      {/* Controls */}
      <div style={{ display: "grid", gap: 8 }}>
        <div><strong>State:</strong> <code>{current || "(starting…)"}</code></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span>Transitions:</span>
          {currentSpec?.to?.length ? (
            currentSpec.to.map((t) => (
              <button key={t} onClick={() => sendTo(t)} style={{ padding: "4px 8px", cursor: "pointer" }}>
                TO_{t}
              </button>
            ))
          ) : (
            <em>(none)</em>
          )}
        </div>
      </div>

      {/* Inspector */}
      {showInspector && (
        <div style={{ width: 800, height: 520, border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
          <iframe
            ref={iframeRef}
            title="Stately Inspector"
            src="https://stately.ai/inspect"
            style={{ width: "100%", height: "100%", border: 0 }}
            tabIndex={0}
            allow="clipboard-read; clipboard-write;"
          />
        </div>
      )}
    </div>
  );
}
